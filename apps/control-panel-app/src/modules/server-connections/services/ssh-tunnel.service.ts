import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IsNull } from "typeorm";
import { Channel, Client, ConnectConfig } from "ssh2";
import * as net from "node:net";

import {
  EncryptionService,
  logStructured,
  logStructuredError,
} from "@shared/common";
import { SSH_DEFAULTS } from "@shared/ssh";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { EntityStatus } from "@control-panel/common/entity/base.entity";

import { ServerEntity } from "../entities/server.entity";
import { ServerSshCredentialEntity } from "../entities/server-ssh-credential.entity";
import { ServerType } from "../enums/server-type.enum";
import { ServerSshAuthType } from "../enums/server-ssh-auth-type.enum";
import {
  SERVER_CONNECTIONS,
  isSelfHosted,
} from "../constants/server-connections.constants";

interface TunnelRecord {
  serverId: string;
  client: Client;
  bindPort: number;
  /** True once the reverse forward is active and the record is healthy. */
  established: boolean;
  /** True when the tunnel was closed intentionally (e.g. server removal). */
  closed: boolean;
}

/**
 * Establishes and maintains reverse SSH tunnels from the control panel to
 * remote servers in self-hosted mode, so a remote agent (which cannot dial the
 * control panel directly) can reach its Socket.IO server through the tunnel.
 *
 * The control panel opens a reverse forward on the remote host bound to
 * SERVER_CONNECTIONS.TUNNEL.BIND_HOST on a dynamically selected port, and pipes
 * accepted connections to the local control panel Socket.IO server. The chosen
 * port is persisted in the server metadata so reconnects reuse the same port
 * (and the agent's CONTROL_PANEL_URL keeps working).
 *
 * The service owns its own ssh2 Client per server — separate from
 * SshConnectionManager — so install/command sessions that disconnect do not
 * tear the tunnel down. Dropped tunnels self-heal with backoff.
 */
@Injectable()
export class SshTunnelService {
  private readonly logger = new Logger(SshTunnelService.name);

  // To-Do: check i we can avoid using global variables
  private readonly records = new Map<string, TunnelRecord>();
  private readonly pending = new Map<string, Promise<number | null>>();
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
    @InjectRepository(ServerSshCredentialEntity)
    private readonly credentialRepository: Repository<ServerSshCredentialEntity>,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Local control panel Socket.IO server port that tunnel connections target.
   */
  private get controlPanelPort(): number {
    return Number(this.configService.get<string>("PORT") ?? 3410);
  }

  /**
   * True when self-hosted mode is enabled (SELF_HOSTED=true/1).
   */
  isEnabled(): boolean {
    return isSelfHosted();
  }

  /**
   * Returns the active tunnel bind port for a server, or null when tunnels are
   * not applicable (Cloud mode) or could not be established.
   *
   * Reuses an existing tunnel and dedupes concurrent calls per server.
   */
  async ensureTunnel(serverId: string): Promise<number | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const existing = this.records.get(serverId);
    if (existing?.established) {
      return existing.bindPort;
    }

    const inflight = this.pending.get(serverId);
    if (inflight) {
      return inflight;
    }
    // todo: replace with async await
    const promise = this.connectAndForward(serverId)
      .then(
        (record) => record.bindPort,
        (error) => {
          logStructured(this.logger, "warn", "tunnel.establish", "failed", {
            module: "SshTunnelService",
            serverId,
            error: toErrorMessage(error),
          });
          return null;
        },
      )
      .finally(() => {
        this.pending.delete(serverId);
      });

    this.pending.set(serverId, promise);
    return promise;
  }

  /**
   * Tears down the tunnel for a server (used during server removal). Also stops
   * the remote stable proxy so no listener is left behind on the remote host.
   */
  async closeTunnel(serverId: string): Promise<void> {
    const timer = this.reconnectTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(serverId);
    }

    const record = this.records.get(serverId);
    if (!record) {
      return;
    }

    record.closed = true;

    try {
      await this.stopStableProxy(record.client, serverId);
    } catch (error) {
      logStructured(this.logger, "warn", "stable.endpoint.closed", "failed", {
        module: "SshTunnelService",
        serverId,
        error: toErrorMessage(error),
      });
    }

    logStructured(this.logger, "log", "tunnel.closed", "succeeded", {
      module: "SshTunnelService",
      serverId,
      bindPort: record.bindPort,
    });
    this.teardownRecord(record);
  }

  /**
   * True when an active tunnel exists for the server.
   */
  hasTunnel(serverId: string): boolean {
    return this.records.get(serverId)?.established === true;
  }

  /**
   * Returns the active tunnel bind port for a server, or null.
   */
  getTunnelPort(serverId: string): number | null {
    const record = this.records.get(serverId);
    return record?.established ? record.bindPort : null;
  }

  private async connectAndForward(serverId: string): Promise<TunnelRecord> {
    const server = await this.serverRepository.findOne({
      where: {
        id: serverId,
        status: EntityStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });
    if (!server) {
      throw new Error(`Active server '${serverId}' not found for tunnel`);
    }
    if (server.serverType === ServerType.LOCAL) {
      throw new Error(
        `Local server '${serverId}' does not need a reverse SSH tunnel`,
      );
    }

    const credential = await this.credentialRepository.findOne({
      where: { serverId, status: EntityStatus.ACTIVE, deletedAt: IsNull() },
    });
    if (!credential) {
      throw new Error(`SSH credentials not found for server '${serverId}'`);
    }

    const client = new Client();
    const record: TunnelRecord = {
      serverId,
      client,
      bindPort: 0,
      established: false,
      closed: false,
    };
    this.records.set(serverId, record);

    try {
      this.attachConnectionLifecycle(record);
      await this.waitForClientReady(client, server, credential);
      this.attachForwardHandler(record);

      const port = await this.forwardToAvailablePort(
        client,
        serverId,
        this.readTunnelPort(server.metadata),
      );
      record.bindPort = port;
      record.established = true;

      await this.persistTunnelPort(serverId, port);

      // Ensure the stable, Agent-facing proxy on the remote host is running and
      // points at this (possibly new) tunnel port. Runs on every (re)connect so
      // reconnect with a changed tunnel port transparently re-points the proxy.
      await this.ensureStableProxy(client, serverId, port);

      logStructured(this.logger, "log", "tunnel.established", "succeeded", {
        module: "SshTunnelService",
        serverId,
        bindPort: port,
        controlPanelPort: this.controlPanelPort,
      });

      return record;
    } catch (error) {
      const current = this.records.get(serverId);
      if (current) {
        this.teardownRecord(current);
      } else {
        try {
          client.end();
        } catch {
          // ignore
        }
      }
      throw error;
    }
  }

  private buildConnectConfig(
    server: ServerEntity,
    credential: ServerSshCredentialEntity,
  ): ConnectConfig {
    const config: ConnectConfig = {
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: SSH_DEFAULTS.READY_TIMEOUT,
      keepaliveInterval: SSH_DEFAULTS.KEEPALIVE_INTERVAL,
      keepaliveCountMax: SSH_DEFAULTS.KEEPALIVE_COUNT_MAX,
    };

    if (
      credential.authType === ServerSshAuthType.PASSWORD ||
      credential.encryptedPassword
    ) {
      config.password = credential.encryptedPassword
        ? this.encryptionService.decrypt(credential.encryptedPassword)
        : undefined;
    }

    if (credential.authType === ServerSshAuthType.PRIVATE_KEY) {
      config.privateKey = credential.encryptedPrivateKey
        ? this.encryptionService.decrypt(credential.encryptedPrivateKey)
        : undefined;
    }

    return config;
  }

  private waitForClientReady(
    client: Client,
    server: ServerEntity,
    credential: ServerSshCredentialEntity,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      client.on("ready", () => {
        resolve();
      });
      client.on("error", (error) => {
        reject(error);
      });
      client.connect(this.buildConnectConfig(server, credential));
    });
  }

  /**
   * Requests a reverse forward on the remote host for the given bind port.
   */
  private forwardIn(client: Client, port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      client.forwardIn(
        SERVER_CONNECTIONS.TUNNEL.BIND_HOST,
        port,
        (err, boundPort) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(boundPort);
        },
      );
    });
  }

  /**
   * Binds a reverse forward using a preferred (persisted) port first, then
   * falling back to randomly selected unused ports. The tunnel port is an
   * internal detail: when it changes the stable proxy is re-pointed, but the
   * Agent-facing CONTROL_PANEL_URL (stable port) never changes.
   */
  private async forwardToAvailablePort(
    client: Client,
    serverId: string,
    preferredPort: number | null,
  ): Promise<number> {
    if (preferredPort) {
      try {
        return await this.forwardIn(client, preferredPort);
      } catch (error) {
        logStructured(this.logger, "warn", "tunnel.port_bind", "failed", {
          module: "SshTunnelService",
          serverId,
          bindPort: preferredPort,
          reason: "preferred_port_failed",
          error: toErrorMessage(error),
        });
        logStructured(this.logger, "warn", "tunnel.port_changed", "succeeded", {
          module: "SshTunnelService",
          serverId,
          fromPort: preferredPort,
          controlPanelPort: this.controlPanelPort,
          reason: "preferred_port_unavailable",
          error: toErrorMessage(error),
        });
        // Fall through to a fresh random tunnel port. The stable proxy is
        // reconciled after the new port is bound.
      }
    }

    const { PORT_MIN, PORT_MAX, PORT_PICK_ATTEMPTS } =
      SERVER_CONNECTIONS.TUNNEL;

    const seen = new Set<number>();

    for (let attempt = 0; attempt < PORT_PICK_ATTEMPTS; attempt++) {
      const port = this.pickRandomPort(PORT_MIN, PORT_MAX);

      if (seen.has(port)) {
        continue;
      }

      seen.add(port);

      try {
        return await this.forwardIn(client, port);
      } catch (error) {
        logStructured(this.logger, "debug", "tunnel.port_bind", "retry", {
          module: "SshTunnelService",
          serverId,
          bindPort: port,
          error: toErrorMessage(error),
        });
      }
    }

    throw new Error(`No available tunnel port for server '${serverId}'`);
  }

  private pickRandomPort(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /**
   * Ensures the stable, Agent-facing endpoint for a server in self-hosted mode:
   * the reverse tunnel is established and the remote TCP proxy is running on
   * the persisted stable port. Returns the stable port (Agent-facing), never
   * the internal tunnel port. Returns null in Cloud mode.
   */
  async ensureStableEndpoint(serverId: string): Promise<number | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const tunnelPort = await this.ensureTunnel(serverId);
    if (tunnelPort === null) {
      return null;
    }

    // connectAndForward already ensured the proxy and persisted the stable
    // port before the tunnel promise resolved.
    return this.readStablePortFromDb(serverId);
  }

  /**
   * Returns the stable CONTROL_PANEL_URL for a remote agent in self-hosted
   * mode, e.g. http://host.docker.internal:30012. The internal reverse SSH
   * tunnel port is never exposed here.
   */
  async getStableControlPanelUrl(serverId: string): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const stablePort = await this.ensureStableEndpoint(serverId);
    if (stablePort === null) {
      return null;
    }

    return `http://host.docker.internal:${stablePort}`;
  }

  /**
   * Allocates/reads the persisted stable port, then makes sure the remote
   * socat proxy is listening on 0.0.0.0:<stablePort> and forwarding to the
   * currently active tunnel port. Re-points the proxy when the tunnel port
   * changed. Throws when the proxy cannot be ensured.
   */
  private async ensureStableProxy(
    client: Client,
    serverId: string,
    tunnelPort: number,
  ): Promise<number> {
    const socatReady = await this.ensureSocat(client);
    if (!socatReady) {
      logStructured(this.logger, "warn", "stable.endpoint.failed", "failed", {
        module: "SshTunnelService",
        serverId,
        reason: "socat_missing",
        error:
          "socat is not available on the remote host and could not be installed",
      });
      throw new Error(
        `Stable TCP proxy requires 'socat' on server '${serverId}' (not found and install failed)`,
      );
    }

    const persisted = await this.readStablePortFromDb(serverId);
    const candidate =
      persisted ??
      this.pickRandomPort(
        SERVER_CONNECTIONS.TUNNEL.STABLE_PORT_MIN,
        SERVER_CONNECTIONS.TUNNEL.STABLE_PORT_MAX,
      );

    const stablePort = await this.tryEnsureProxyOnPort(
      client,
      serverId,
      candidate,
      tunnelPort,
    );
    if (stablePort !== null) {
      await this.persistStablePort(serverId, stablePort);
      return stablePort;
    }

    logStructured(this.logger, "warn", "stable.endpoint.failed", "failed", {
      module: "SshTunnelService",
      serverId,
      tunnelPort,
      reason: "no_port_available",
      error: `Could not start the stable TCP proxy on any stable port for server '${serverId}'`,
    });
    throw new Error(
      `Could not start the stable TCP proxy for server '${serverId}'`,
    );
  }

  private async tryEnsureProxyOnPort(
    client: Client,
    serverId: string,
    stablePort: number,
    tunnelPort: number,
  ): Promise<number | null> {
    const state = await this.checkStableProxy(
      client,
      serverId,
      stablePort,
      tunnelPort,
    );
    if (state === "ok") {
      logStructured(this.logger, "log", "stable.endpoint.reused", "succeeded", {
        module: "SshTunnelService",
        serverId,
        stablePort,
        tunnelPort,
        controlPanelPort: this.controlPanelPort,
      });
      return stablePort;
    }

    if (state === "stale") {
      logStructured(
        this.logger,
        "log",
        "tunnel.proxy.reconnected",
        "succeeded",
        {
          module: "SshTunnelService",
          serverId,
          stablePort,
          tunnelPort,
          controlPanelPort: this.controlPanelPort,
          reason: "tunnel_port_changed",
        },
      );
      await this.stopStableProxy(client, serverId);
    }

    if (await this.startStableProxy(client, serverId, stablePort, tunnelPort)) {
      return stablePort;
    }

    // The stable port may be held by a foreign process — fall back to fresh
    // random stable ports.
    const seen = new Set<number>([stablePort]);
    for (
      let attempt = 0;
      attempt < SERVER_CONNECTIONS.TUNNEL.STABLE_PORT_PICK_ATTEMPTS;
      attempt++
    ) {
      const port = this.pickRandomPort(
        SERVER_CONNECTIONS.TUNNEL.STABLE_PORT_MIN,
        SERVER_CONNECTIONS.TUNNEL.STABLE_PORT_MAX,
      );
      if (seen.has(port)) {
        continue;
      }
      seen.add(port);

      await this.stopStableProxy(client, serverId);
      if (await this.startStableProxy(client, serverId, port, tunnelPort)) {
        return port;
      }
    }

    return null;
  }

  /**
   * Ensures socat is available on the remote host, installing it via the host
   * package manager (root or passwordless sudo) when missing.
   */
  private async ensureSocat(client: Client): Promise<boolean> {
    const probe = await this.execRemote(
      client,
      "if command -v socat >/dev/null 2>&1; then echo READY; else echo MISSING; fi",
    );
    if (probe.stdout.trim() === "READY") {
      return true;
    }

    const install = [
      'ELEV=""; [ "$(id -u)" != "0" ] && command -v sudo >/dev/null 2>&1 && ELEV="sudo -n"; ',
      "if command -v apt-get >/dev/null 2>&1; then $ELEV apt-get update -y >/dev/null 2>&1; $ELEV apt-get install -y socat >/dev/null 2>&1; ",
      "elif command -v apk >/dev/null 2>&1; then $ELEV apk add --no-cache socat >/dev/null 2>&1; ",
      "elif command -v dnf >/dev/null 2>&1; then $ELEV dnf install -y socat >/dev/null 2>&1; ",
      "elif command -v yum >/dev/null 2>&1; then $ELEV yum install -y socat >/dev/null 2>&1; fi; ",
      "command -v socat >/dev/null 2>&1 && echo READY || echo MISSING;",
    ].join("");

    const result = await this.execRemote(client, install);
    return result.stdout.trim() === "READY";
  }

  /**
   * Checks the remote proxy state for a stable port: "ok" when running and
   * forwarding to the current tunnel port, "stale" when running against an old
   * tunnel port, "missing" when not running, or "error" when the check failed.
   */
  private async checkStableProxy(
    client: Client,
    serverId: string,
    stablePort: number,
    tunnelPort: number,
  ): Promise<"ok" | "stale" | "missing" | "error"> {
    try {
      const result = await this.execRemote(
        client,
        this.buildCheckProxyCommand(serverId, tunnelPort),
      );
      const status = result.stdout.trim();
      logStructured(this.logger, "debug", "tunnel.proxy.checked", "succeeded", {
        module: "SshTunnelService",
        serverId,
        stablePort,
        tunnelPort,
        controlPanelPort: this.controlPanelPort,
        proxyStatus:
          status === "OK" ? "ok" : status === "STALE" ? "stale" : "missing",
      });
      if (status === "OK") {
        return "ok";
      }
      if (status === "STALE") {
        return "stale";
      }
      return "missing";
    } catch (error) {
      logStructured(this.logger, "warn", "stable.endpoint.failed", "failed", {
        module: "SshTunnelService",
        serverId,
        stablePort,
        reason: "proxy_check_failed",
        error: toErrorMessage(error),
      });
      return "error";
    }
  }

  /**
   * Launches (or relaunches) the remote socat proxy on the stable port,
   * forwarding to the given tunnel port. Returns true once the proxy is up.
   */
  private async startStableProxy(
    client: Client,
    serverId: string,
    stablePort: number,
    tunnelPort: number,
  ): Promise<boolean> {
    try {
      const result = await this.execRemote(
        client,
        this.buildStartProxyCommand(serverId, stablePort, tunnelPort),
      );
      const started = result.stdout.includes("STARTED");
      if (started) {
        logStructured(this.logger, "log", "tunnel.proxy.started", "succeeded", {
          module: "SshTunnelService",
          serverId,
          stablePort,
          tunnelPort,
          controlPanelPort: this.controlPanelPort,
        });
        logStructured(
          this.logger,
          "log",
          "stable.endpoint.started",
          "succeeded",
          {
            module: "SshTunnelService",
            serverId,
            stablePort,
            tunnelPort,
            controlPanelPort: this.controlPanelPort,
          },
        );
      } else {
        logStructured(
          this.logger,
          "warn",
          "tunnel.proxy.upstream_failed",
          "failed",
          {
            module: "SshTunnelService",
            serverId,
            stablePort,
            tunnelPort,
            controlPanelPort: this.controlPanelPort,
            reason: "proxy_exited_after_start",
            stderr: result.stderr.trim().slice(0, 500),
          },
        );
      }
      return started;
    } catch (error) {
      logStructured(
        this.logger,
        "warn",
        "tunnel.proxy.upstream_failed",
        "failed",
        {
          module: "SshTunnelService",
          serverId,
          stablePort,
          tunnelPort,
          reason: "start_command_failed",
          error: toErrorMessage(error),
        },
      );
      return false;
    }
  }

  /**
   * Stops the remote socat proxy (if any) for the server. Best-effort: logs
   * success/failure but never throws to the caller.
   */
  private async stopStableProxy(
    client: Client,
    serverId: string,
  ): Promise<void> {
    try {
      await this.execRemote(client, this.buildStopProxyCommand(serverId));
      logStructured(this.logger, "log", "stable.endpoint.closed", "succeeded", {
        module: "SshTunnelService",
        serverId,
      });
      logStructured(this.logger, "log", "tunnel.proxy.closed", "succeeded", {
        module: "SshTunnelService",
        serverId,
      });
    } catch (error) {
      logStructured(this.logger, "warn", "stable.endpoint.closed", "failed", {
        module: "SshTunnelService",
        serverId,
        error: toErrorMessage(error),
      });
    }
  }

  private proxyPidFile(serverId: string): string {
    return `${SERVER_CONNECTIONS.TUNNEL.STABLE_PROXY.PID_FILE_PREFIX}${serverId}.pid`;
  }

  private buildStartProxyCommand(
    serverId: string,
    stablePort: number,
    tunnelPort: number,
  ): string {
    const pidFile = this.proxyPidFile(serverId);
    const settleSec = Math.max(
      1,
      Math.round(SERVER_CONNECTIONS.TUNNEL.STABLE_PROXY.START_SETTLE_MS / 1000),
    );
    return [
      `rm -f ${pidFile}`,
      `nohup socat TCP-LISTEN:${stablePort},fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:${tunnelPort} </dev/null >/dev/null 2>&1 &`,
      `echo $! > ${pidFile}`,
      `sleep ${settleSec}`,
      `if [ -f ${pidFile} ] && kill -0 "$(cat ${pidFile} 2>/dev/null)" 2>/dev/null; then echo STARTED; else echo FAILED; fi`,
    ].join("\n");
  }

  private buildCheckProxyCommand(serverId: string, tunnelPort: number): string {
    const pidFile = this.proxyPidFile(serverId);
    return [
      `P="$(cat ${pidFile} 2>/dev/null || true)"`,
      `if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then`,
      `  if ps -o args= -p "$P" 2>/dev/null | grep -qF "TCP:127.0.0.1:${tunnelPort}"; then echo OK; else echo STALE; fi`,
      `else echo MISSING; fi`,
    ].join("\n");
  }

  private buildStopProxyCommand(serverId: string): string {
    const pidFile = this.proxyPidFile(serverId);
    return [
      `P="$(cat ${pidFile} 2>/dev/null || true)"`,
      `if [ -n "$P" ]; then kill "$P" 2>/dev/null || true; fi`,
      `rm -f ${pidFile}`,
      `echo STOPPED`,
    ].join("\n");
  }

  /**
   * Runs a command on the remote host through the given (connected) ssh2 client
   * and returns its stdout/stderr/exit code.
   */
  private execRemote(
    client: Client,
    command: string,
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    const timeoutMs = SERVER_CONNECTIONS.TUNNEL.STABLE_PROXY.EXEC_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Remote command timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      timer.unref?.();

      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            reject(err);
          }
          return;
        }
        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
        stream.on("close", (code: number | null) => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            resolve({ stdout, stderr, code });
          }
        });
      });
    });
  }

  private async readStablePortFromDb(serverId: string): Promise<number | null> {
    const server = await this.serverRepository.findOne({
      where: { id: serverId },
      select: { id: true, metadata: true },
    });
    return server ? this.readStablePort(server.metadata) : null;
  }

  private readStablePort(
    metadata: Record<string, unknown> | null,
  ): number | null {
    const raw = metadata?.[SERVER_CONNECTIONS.TUNNEL.METADATA_STABLE_PORT_KEY];
    const port =
      typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
    return Number.isFinite(port) && port >= 1 && port <= 65_535 ? port : null;
  }

  private async persistStablePort(
    serverId: string,
    port: number,
  ): Promise<void> {
    const server = await this.serverRepository.findOne({
      where: { id: serverId },
      select: { id: true, metadata: true },
    });
    if (!server) {
      return;
    }
    const metadata = {
      ...(server.metadata ?? {}),
      [SERVER_CONNECTIONS.TUNNEL.METADATA_STABLE_PORT_KEY]: port,
    };
    await this.serverRepository.update(serverId, { metadata });
  }

  /**
   * Pipes remote forward connections to the local control panel Socket.IO server.
   */
  private attachForwardHandler(record: TunnelRecord): void {
    record.client.on(
      "tcp connection",
      (
        details: { destPort: number; srcIP: string; srcPort: number },
        accept: () => Channel,
      ) => {
        logStructured(
          this.logger,
          "debug",
          "tunnel.proxy.connection",
          "succeeded",
          {
            module: "SshTunnelService",
            serverId: record.serverId,
            tunnelPort: record.bindPort,
            controlPanelPort: this.controlPanelPort,
            srcIP: details.srcIP,
          },
        );

        const channel = accept();
        const socket = net.connect({
          host: SERVER_CONNECTIONS.TUNNEL.LOCAL_HOST,
          port: this.controlPanelPort,
        });

        socket.once("connect", () => {
          logStructured(
            this.logger,
            "debug",
            "tunnel.proxy.upstream_connected",
            "succeeded",
            {
              module: "SshTunnelService",
              serverId: record.serverId,
              tunnelPort: record.bindPort,
              controlPanelPort: this.controlPanelPort,
            },
          );
        });

        channel.on("error", () => socket.destroy());
        socket.on("error", () => channel.destroy());
        channel.on("close", () => socket.destroy());
        socket.on("close", () => channel.end());

        channel.pipe(socket).pipe(channel);
      },
    );
  }

  /**
   * Handles SSH connection loss: tears down the tunnel and, when it was
   * previously established, schedules a reconnect with backoff.
   */
  private attachConnectionLifecycle(record: TunnelRecord): void {
    const onDrop = () => {
      if (record.closed) {
        return;
      }
      const wasEstablished = record.established;
      this.teardownRecord(record);
      if (wasEstablished) {
        logStructured(this.logger, "warn", "tunnel.dropped", "retry", {
          module: "SshTunnelService",
          serverId: record.serverId,
          bindPort: record.bindPort,
          reason: "ssh_connection_lost",
        });
        this.scheduleReconnect(record.serverId);
      }
    };

    record.client.on("error", onDrop);
    record.client.on("close", onDrop);
    record.client.on("end", onDrop);
  }

  private teardownRecord(record: TunnelRecord): void {
    if (this.records.get(record.serverId) === record) {
      this.records.delete(record.serverId);
    }
    const timer = this.reconnectTimers.get(record.serverId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(record.serverId);
    }
    try {
      record.client.removeAllListeners();
    } catch {
      // ignore
    }
    try {
      record.client.end();
    } catch {
      // ignore
    }
  }

  private scheduleReconnect(serverId: string): void {
    if (this.reconnectTimers.has(serverId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(serverId);
      this.ensureTunnel(serverId).catch((error) => {
        logStructuredError(this.logger, "tunnel.reconnect", error, {
          module: "SshTunnelService",
          serverId,
        });
        this.scheduleReconnect(serverId);
      });
    }, SERVER_CONNECTIONS.TUNNEL.RETRY_DELAY_MS);
    timer.unref?.();
    this.reconnectTimers.set(serverId, timer);
  }

  private readTunnelPort(
    metadata: Record<string, unknown> | null,
  ): number | null {
    const raw = metadata?.[SERVER_CONNECTIONS.TUNNEL.METADATA_PORT_KEY];
    const port =
      typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
    return Number.isFinite(port) && port >= 1 && port <= 65_535 ? port : null;
  }

  private async persistTunnelPort(
    serverId: string,
    port: number,
  ): Promise<void> {
    const server = await this.serverRepository.findOne({
      where: { id: serverId },
      select: { id: true, metadata: true },
    });
    if (!server) {
      return;
    }
    const metadata = {
      ...(server.metadata ?? {}),
      [SERVER_CONNECTIONS.TUNNEL.METADATA_PORT_KEY]: port,
    };
    await this.serverRepository.update(serverId, { metadata });
  }
}
