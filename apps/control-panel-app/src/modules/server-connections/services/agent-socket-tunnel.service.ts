import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as net from "node:net";
import { Client, ConnectConfig } from "ssh2";
import { IsNull, Not, Repository } from "typeorm";

import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { EncryptionService, logStructured } from "@shared/common";
import { AUTH_TYPE, SSH_DEFAULTS, SshConnectionOptions } from "@shared/ssh";
import { normalizeServerHostForUrls } from "@control-panel/modules/deployments/utils/deployment-server.util";

import {
  AGENT_SOCKET_TUNNEL,
  IS_CLOUD_VERSION_ENV,
} from "../constants/agent-socket-tunnel.constants";
import { ServerEntity } from "../entities/server.entity";
import { ServerSshCredentialEntity } from "../entities/server-ssh-credential.entity";
import { ServerType } from "../enums/server-type.enum";
import {
  AgentSocketTunnelResult,
  EnsureAgentSocketTunnelInput,
} from "../interfaces/agent-socket-tunnel.interface";
import { readAgentSocketTunnelPortFromEnv } from "../utils/agent-socket-tunnel-port.util";
import type { ParseAgentSocketTunnelPortResult } from "../utils/agent-socket-tunnel-port.util";
import { buildEnsureSshGatewayPortsCommand } from "../utils/ensure-ssh-gateway-ports.util";
import { isCloudVersionEnabled } from "../utils/cloud-version.util";

interface HostTunnelState {
  hostKey: string;
  client: Client;
  options: SshConnectionOptions;
  ready: boolean;
  closing: boolean;
  reconnectAttempt: number;
  reconnectTimer?: NodeJS.Timeout;
  /** When true, close must not schedule another reconnect (auth / config errors). */
  stopReconnect?: boolean;
}

/**
 * Self-host only: long-lived SSH reverse tunnel per remote host.
 * Remote `0.0.0.0/*:{AGENT_SOCKET_TUNNEL_PORT}` is forwarded to this process's
 * control-panel port so the agent container can connect via
 * `host.docker.internal:{AGENT_SOCKET_TUNNEL_PORT}` (Docker host-gateway).
 *
 * GatewayPorts is configured on a separate SSH session before the long-lived
 * tunnel connection opens.
 *
 * Uses its own ssh2 clients (not {@link SshConnectionManager}) so install /
 * terminal disconnects do not tear the tunnel down.
 */
@Injectable()
export class AgentSocketTunnelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentSocketTunnelService.name);
  private readonly tunnels = new Map<string, HostTunnelState>();
  private readonly inflight = new Map<
    string,
    Promise<AgentSocketTunnelResult>
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
    @InjectRepository(ServerSshCredentialEntity)
    private readonly credentialRepository: Repository<ServerSshCredentialEntity>,
  ) {}

  /**
   * Returns whether the control panel runs in cloud mode (public agent sockets).
   *
   * Reads {@link IS_CLOUD_VERSION_ENV} from config. When `true`, SSH reverse
   * tunnels are disabled and agents connect directly via `CONTROL_PANEL_URL`.
   *
   * @returns `true` when `IS_CLOUD_VERSION=true`; otherwise `false`.
   */
  isCloudVersion(): boolean {
    try {
      return isCloudVersionEnabled(
        this.configService.get<string>(IS_CLOUD_VERSION_ENV),
      );
    } catch (error) {
      this.logger.error(
        `isCloudVersion failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Returns whether self-host mode is active (SSH reverse tunnels enabled).
   *
   * @returns `true` when not in cloud mode.
   */
  isSelfHostMode(): boolean {
    try {
      return !this.isCloudVersion();
    } catch (error) {
      this.logger.error(
        `isSelfHostMode failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    }
  }

  /**
   * Nest lifecycle hook: restores tunnels for all active remote servers on startup.
   *
   * Skipped in cloud mode. Failures are logged and do not block app boot.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.restoreTunnelsForActiveServers();
    } catch (error) {
      this.logger.error(
        `Failed to restore agent socket tunnels: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Nest lifecycle hook: closes all open tunnels when the process shuts down.
   *
   * Clears reconnect timers and ends SSH clients intentionally.
   */
  onModuleDestroy(): void {
    try {
      for (const hostKey of [...this.tunnels.keys()]) {
        this.closeTunnel(hostKey, true);
      }
    } catch (error) {
      this.logger.error(
        `onModuleDestroy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Opens or reuses the reverse SSH tunnel for one remote server (self-host only).
   *
   * Skips cloud mode and {@link ServerType.LOCAL}. Builds SSH options from the
   * server row and credential, then delegates to {@link ensureForHost}.
   *
   * @param input.server - Active server entity (host, port, username, type).
   * @param input.credential - Encrypted SSH credential for the server.
   * @param input.plainPrivateKey - Optional decrypted key from onboard (not stored).
   * @returns Success, skip, or error result for callers (onboard / install).
   */
  async ensureForServer(
    input: EnsureAgentSocketTunnelInput,
  ): Promise<AgentSocketTunnelResult> {
    try {
      if (!this.isSelfHostMode()) {
        return { ok: true, skipped: true };
      }

      if (input.server.serverType === ServerType.LOCAL) {
        return { ok: true, skipped: true };
      }

      const options = this.buildSshOptions(
        input.server,
        input.credential,
        input.plainPrivateKey,
      );
      return await this.ensureForHost(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`ensureForServer failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  /**
   * Loads server + credential from the database and ensures the host tunnel exists.
   *
   * Used when only `serverId` is known (startup restore, deploy recovery).
   *
   * @param serverId - Active server UUID.
   * @param plainPrivateKey - Optional decrypted key (e.g. during onboard).
   * @returns Tunnel result; skipped for cloud/local; error if credentials missing.
   */
  async ensureForServerId(
    serverId: string,
    plainPrivateKey?: string,
  ): Promise<AgentSocketTunnelResult> {
    try {
      if (!this.isSelfHostMode()) {
        return { ok: true, skipped: true };
      }

      const server = await this.serverRepository.findOne({
        where: {
          id: serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      if (!server || server.serverType === ServerType.LOCAL) {
        return { ok: true, skipped: true };
      }

      const credential = await this.credentialRepository.findOne({
        where: {
          serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      if (!credential) {
        return {
          ok: false,
          error: `No SSH credentials for server '${serverId}' (needed for the self-host socket tunnel)`,
        };
      }

      return await this.ensureForServer({
        server,
        credential,
        plainPrivateKey,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`ensureForServerId failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  /**
   * Closes the reverse tunnel for a host when no active servers still need it.
   *
   * Called after server deletion. One tunnel serves all users on the same host.
   *
   * @param host - Server host/IP as stored in `servers.host`.
   * @param exceptServerId - Server id to ignore (the one being deleted).
   */
  async releaseIfHostUnused(
    host: string,
    exceptServerId?: string,
  ): Promise<void> {
    try {
      if (!this.isSelfHostMode()) {
        return;
      }

      const hostKey = this.hostKey(host);
      const remaining = await this.serverRepository.find({
        where: {
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
          serverType: Not(ServerType.LOCAL),
        },
        select: { id: true, host: true },
      });

      const stillUsed = remaining.some((server) => {
        if (exceptServerId && server.id === exceptServerId) {
          return false;
        }
        return this.hostKey(server.host) === hostKey;
      });

      if (!stillUsed) {
        this.closeTunnel(hostKey, true);
      }
    } catch (error) {
      this.logger.error(
        `releaseIfHostUnused failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * On startup, opens one tunnel per distinct remote host that has active servers.
   *
   * Tries each server on a host until one SSH login succeeds (shared tunnel).
   */
  private async restoreTunnelsForActiveServers(): Promise<void> {
    try {
      if (!this.isSelfHostMode()) {
        logStructured(this.logger, "log", "agent.socket_tunnel", "skipped", {
          module: "AgentSocketTunnelService",
          reason: "cloud_version",
        });
        return;
      }

      const servers = await this.serverRepository.find({
        where: {
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
          serverType: Not(ServerType.LOCAL),
        },
      });

      const byHost = new Map<string, ServerEntity[]>();
      for (const server of servers) {
        const key = this.hostKey(server.host);
        const list = byHost.get(key) ?? [];
        list.push(server);
        byHost.set(key, list);
      }

      for (const group of byHost.values()) {
        let opened = false;
        for (const server of group) {
          const result = await this.ensureForServerId(server.id);
          if (result.ok) {
            opened = true;
            break;
          }
          this.logger.warn(
            `Startup tunnel failed for server '${server.id}' host='${server.host}': ${result.error ?? "unknown"}`,
          );
        }
        if (!opened) {
          this.logger.warn(
            `No SSH reverse tunnel opened for host '${group[0]?.host}'`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `restoreTunnelsForActiveServers failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensures a single tunnel exists for the SSH host in `options.host`.
   *
   * Reuses a ready tunnel, deduplicates concurrent opens via `inflight`, or
   * calls {@link openTunnel}.
   *
   * @param options - SSH connection options including `serverId` and host auth.
   * @returns Whether the tunnel is ready or an error message.
   */
  private async ensureForHost(
    options: SshConnectionOptions,
  ): Promise<AgentSocketTunnelResult> {
    try {
      const hostKey = this.hostKey(options.host);
      const existing = this.tunnels.get(hostKey);
      if (existing?.ready && !existing.closing) {
        return { ok: true };
      }

      const pending = this.inflight.get(hostKey);
      if (pending) {
        return await pending;
      }

      const job = (async (): Promise<AgentSocketTunnelResult> => {
        // GatewayPorts must be applied on a throwaway SSH session. Reloading
        // sshd on the tunnel connection leaves that session with old policy
        // (loopback-only reverse binds).
        const gatewayPorts = await this.prepareRemoteGatewayPorts(options);
        if (!gatewayPorts.ok) {
          return gatewayPorts;
        }
        return this.openTunnel(options);
      })();

      this.inflight.set(hostKey, job);
      try {
        return await job;
      } finally {
        this.inflight.delete(hostKey);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`ensureForHost failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  /**
   * Opens a new SSH session and registers `forwardIn` on the remote host.
   *
   * Binds remote all-interfaces:{AGENT_SOCKET_TUNNEL_PORT} to the local
   * control-panel HTTP port. Caller must have already ensured GatewayPorts
   * via {@link prepareRemoteGatewayPorts}. Pipes each incoming tunnel TCP
   * stream to localhost. Schedules reconnect on unexpected close via
   * {@link scheduleReconnect}.
   *
   * @param options - SSH target and credentials for this host.
   * @returns Resolves when `forwardIn` succeeds or the initial connect fails.
   */
  private openTunnel(
    options: SshConnectionOptions,
  ): Promise<AgentSocketTunnelResult> {
    const hostKey = this.hostKey(options.host);
    const localPort = this.localPanelPort();
    const portResult = this.remoteTunnelPort();
    if (!portResult.ok) {
      return Promise.resolve({ ok: false, error: portResult.error });
    }
    const remoteTunnelPort = portResult.port;
    const remoteBindLog = AGENT_SOCKET_TUNNEL.REMOTE_BIND_HOST_LOG;

    return new Promise((resolve) => {
      try {
        const previousAttempt =
          this.tunnels.get(hostKey)?.reconnectAttempt ?? 0;
        this.closeTunnel(hostKey, true);

        const client = new Client();
        const state: HostTunnelState = {
          hostKey,
          client,
          options,
          ready: false,
          closing: false,
          reconnectAttempt: previousAttempt,
          stopReconnect: false,
        };
        this.tunnels.set(hostKey, state);

        let settled = false;
        const settle = (result: AgentSocketTunnelResult) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(result);
        };

        client.on("ready", () => {
          try {
            client.forwardIn(
              AGENT_SOCKET_TUNNEL.REMOTE_BIND_HOST,
              remoteTunnelPort,
              (error) => {
                try {
                  if (error) {
                    const message = `Failed to bind reverse tunnel on ${options.host}:${remoteTunnelPort}: ${error.message}`;
                    this.logger.error(message);
                    settle({ ok: false, error: message });
                    this.closeTunnel(hostKey, false);
                    return;
                  }

                  state.ready = true;
                  state.reconnectAttempt = 0;
                  state.stopReconnect = false;
                  logStructured(
                    this.logger,
                    "log",
                    "agent.socket_tunnel",
                    "succeeded",
                    {
                      module: "AgentSocketTunnelService",
                      serverId: options.serverId,
                      target: `${options.host}:${remoteTunnelPort}`,
                    },
                  );
                  this.logger.log(
                    `SSH reverse tunnel ready host=${options.host} remote=${remoteBindLog}:${remoteTunnelPort} → 127.0.0.1:${localPort}`,
                  );
                  settle({ ok: true });
                } catch (forwardError) {
                  const message =
                    forwardError instanceof Error
                      ? forwardError.message
                      : String(forwardError);
                  this.logger.error(
                    `forwardIn callback failed host=${options.host}: ${message}`,
                  );
                  settle({ ok: false, error: message });
                  this.closeTunnel(hostKey, false);
                }
              },
            );
          } catch (readyError) {
            const message =
              readyError instanceof Error
                ? readyError.message
                : String(readyError);
            this.logger.error(
              `SSH ready handler failed host=${options.host}: ${message}`,
            );
            settle({ ok: false, error: message });
            this.closeTunnel(hostKey, true);
          }
        });

        client.on("tcp connection", (_info, accept) => {
          try {
            const sshStream = accept();
            const localSocket = net.createConnection({
              host: AGENT_SOCKET_TUNNEL.LOCAL_FORWARD_HOST,
              port: localPort,
            });

            const tearDown = () => {
              sshStream.destroy();
              localSocket.destroy();
            };

            localSocket.on("error", (error: Error) => {
              this.logger.warn(
                `Tunnel local TCP error host=${options.host}: ${error.message}`,
              );
              tearDown();
            });
            sshStream.on("error", (error: Error) => {
              this.logger.warn(
                `Tunnel SSH stream error host=${options.host}: ${error.message}`,
              );
              tearDown();
            });

            sshStream.pipe(localSocket);
            localSocket.pipe(sshStream);
          } catch (tcpError) {
            this.logger.error(
              `Tunnel tcp connection handler failed host=${options.host}: ${tcpError instanceof Error ? tcpError.message : String(tcpError)}`,
            );
          }
        });

        client.on("error", (error) => {
          try {
            this.logger.warn(
              `SSH tunnel error host=${options.host}: ${error.message}`,
            );
            if (this.isPermanentSshFailure(error.message)) {
              state.stopReconnect = true;
            }
            settle({
              ok: false,
              error: `SSH tunnel error for ${options.host}: ${error.message}`,
            });
          } catch (handlerError) {
            this.logger.error(
              `SSH error handler failed host=${options.host}: ${handlerError instanceof Error ? handlerError.message : String(handlerError)}`,
            );
          }
        });

        client.on("close", () => {
          try {
            const current = this.tunnels.get(hostKey);
            const shouldReconnect = Boolean(
              current &&
              !current.closing &&
              !current.stopReconnect &&
              current.reconnectAttempt <
                AGENT_SOCKET_TUNNEL.RECONNECT_MAX_ATTEMPTS,
            );
            if (current?.client === client) {
              current.ready = false;
            }
            if (!settled) {
              settle({
                ok: false,
                error: `SSH tunnel closed for ${options.host}`,
              });
            }
            if (shouldReconnect) {
              this.scheduleReconnect(hostKey);
              return;
            }
            if (current && !current.closing) {
              if (current.stopReconnect) {
                this.logger.error(
                  `SSH reverse tunnel stopped for ${options.host} (permanent failure; fix credentials and re-onboard / ensure agent).`,
                );
              } else if (
                current.reconnectAttempt >=
                AGENT_SOCKET_TUNNEL.RECONNECT_MAX_ATTEMPTS
              ) {
                this.logger.error(
                  `SSH reverse tunnel stopped for ${options.host} after ${AGENT_SOCKET_TUNNEL.RECONNECT_MAX_ATTEMPTS} reconnect attempts.`,
                );
              }
              this.closeTunnel(hostKey, true);
            }
          } catch (closeError) {
            this.logger.error(
              `SSH close handler failed host=${options.host}: ${closeError instanceof Error ? closeError.message : String(closeError)}`,
            );
          }
        });

        try {
          client.connect(this.buildConnectConfig(options));
        } catch (connectError) {
          const message =
            connectError instanceof Error
              ? connectError.message
              : String(connectError);
          settle({ ok: false, error: message });
          this.closeTunnel(hostKey, true);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`openTunnel failed host=${options.host}: ${message}`);
        resolve({ ok: false, error: message });
      }
    });
  }

  /**
   * Ensures GatewayPorts on a short-lived SSH session, then disconnects.
   *
   * Must run before {@link openTunnel}. Reloading sshd on the tunnel connection
   * itself leaves reverse-forwards stuck on loopback for that session.
   *
   * @param options - SSH target and credentials for this host.
   */
  private prepareRemoteGatewayPorts(
    options: SshConnectionOptions,
  ): Promise<AgentSocketTunnelResult> {
    return new Promise((resolve) => {
      const client = new Client();
      let settled = false;
      const settle = (result: AgentSocketTunnelResult) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          client.removeAllListeners();
          client.end();
        } catch {
          // ignore disconnect errors after config step
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        settle({
          ok: false,
          error: `Timed out configuring SSH GatewayPorts on ${options.host}`,
        });
      }, 60_000);

      client.on("ready", () => {
        void this.ensureRemoteGatewayPorts(client, options.host).then(
          (result) => {
            clearTimeout(timer);
            settle(result);
          },
        );
      });

      client.on("error", (error) => {
        clearTimeout(timer);
        settle({
          ok: false,
          error: `Failed to configure SSH GatewayPorts on ${options.host}: ${error.message}`,
        });
      });

      try {
        client.connect(this.buildConnectConfig(options));
      } catch (error) {
        clearTimeout(timer);
        settle({
          ok: false,
          error: `Failed to configure SSH GatewayPorts on ${options.host}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    });
  }

  /**
   * Ensures remote sshd allows reverse tunnels to bind on non-loopback addresses.
   *
   * Writes `/etc/ssh/sshd_config.d/99-kubeara-agent-tunnel.conf` when needed
   * (`AllowTcpForwarding yes`, `GatewayPorts clientspecified`) and reloads sshd.
   * Required so Docker agents can reach the tunnel via host-gateway.
   *
   * @param client - Connected ssh2 client (throwaway prep session).
   * @param host - Remote host (logging only).
   */
  private ensureRemoteGatewayPorts(
    client: Client,
    host: string,
  ): Promise<AgentSocketTunnelResult> {
    return new Promise((resolve) => {
      try {
        const command = buildEnsureSshGatewayPortsCommand();
        const timeoutMs = 60_000;
        let settled = false;
        const settle = (result: AgentSocketTunnelResult) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(result);
        };

        const timer = setTimeout(() => {
          settle({
            ok: false,
            error: `Timed out configuring SSH GatewayPorts on ${host}`,
          });
        }, timeoutMs);

        client.exec(command, (error, stream) => {
          try {
            if (error) {
              clearTimeout(timer);
              settle({
                ok: false,
                error: `Failed to configure SSH GatewayPorts on ${host}: ${error.message}`,
              });
              return;
            }

            let stdout = "";
            let stderr = "";
            stream.on("data", (chunk: Buffer | string) => {
              stdout += chunk.toString();
            });
            stream.stderr.on("data", (chunk: Buffer | string) => {
              stderr += chunk.toString();
            });
            stream.on("close", (code: number | null) => {
              clearTimeout(timer);
              const detail = [stdout, stderr]
                .map((s) => s.trim())
                .filter(Boolean)
                .join(" | ");
              if (code !== 0) {
                settle({
                  ok: false,
                  error:
                    `Failed to configure SSH GatewayPorts on ${host}` +
                    (detail ? `: ${detail}` : ""),
                });
                return;
              }
              if (detail) {
                this.logger.log(
                  `SSH GatewayPorts ready host=${host}: ${detail}`,
                );
              }
              settle({ ok: true });
            });
          } catch (execError) {
            clearTimeout(timer);
            settle({
              ok: false,
              error: `Failed to configure SSH GatewayPorts on ${host}: ${
                execError instanceof Error
                  ? execError.message
                  : String(execError)
              }`,
            });
          }
        });
      } catch (error) {
        resolve({
          ok: false,
          error: `Failed to configure SSH GatewayPorts on ${host}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    });
  }

  /**
   * Schedules a delayed reconnect after an unexpected SSH tunnel disconnect.
   *
   * Uses exponential backoff so flaky networks do not hammer `forwardIn`.
   * Skips permanent auth failures and stops after
   * {@link AGENT_SOCKET_TUNNEL.RECONNECT_MAX_ATTEMPTS}. Only one pending
   * reconnect timer exists per host; cleared in {@link closeTunnel} on
   * intentional shutdown.
   *
   * @param hostKey - Normalized host map key from {@link hostKey}.
   */
  private scheduleReconnect(hostKey: string): void {
    try {
      const state = this.tunnels.get(hostKey);
      if (!state || state.closing || state.stopReconnect) {
        return;
      }

      if (
        state.reconnectAttempt >= AGENT_SOCKET_TUNNEL.RECONNECT_MAX_ATTEMPTS
      ) {
        this.logger.error(
          `SSH reverse tunnel stopped for ${state.options.host} after ${AGENT_SOCKET_TUNNEL.RECONNECT_MAX_ATTEMPTS} reconnect attempts.`,
        );
        this.closeTunnel(hostKey, true);
        return;
      }

      if (state.reconnectTimer) {
        return;
      }

      const delay = Math.min(
        AGENT_SOCKET_TUNNEL.RECONNECT_DELAY_MS *
          Math.max(1, 2 ** state.reconnectAttempt),
        AGENT_SOCKET_TUNNEL.RECONNECT_DELAY_MAX_MS,
      );
      state.reconnectAttempt += 1;

      this.logger.log(
        `Reconnecting SSH reverse tunnel for ${state.options.host} in ${delay}ms (attempt ${state.reconnectAttempt}/${AGENT_SOCKET_TUNNEL.RECONNECT_MAX_ATTEMPTS})`,
      );

      // TODO(revisit): Re-evaluate timer-based reconnect (setTimeout vs immediate retry or
      // node:timers/promises). We delay retries with exponential backoff after SSH tunnel
      // close so flaky networks do not hammer reconnect + forwardIn; only one pending
      // reconnect is allowed and closeTunnel clears this timer on intentional shutdown.
      state.reconnectTimer = setTimeout(() => {
        try {
          const current = this.tunnels.get(hostKey);
          if (!current || current.closing || current.stopReconnect) {
            return;
          }
          current.reconnectTimer = undefined;
          void this.ensureForHost(current.options).then((result) => {
            try {
              if (result.ok) {
                return;
              }
              this.logger.warn(
                `SSH reverse tunnel reconnect failed for ${current.options.host}: ${result.error ?? "unknown"}`,
              );
              if (
                this.isPermanentSshFailure(result.error) ||
                current.reconnectAttempt >=
                  AGENT_SOCKET_TUNNEL.RECONNECT_MAX_ATTEMPTS
              ) {
                current.stopReconnect = true;
                this.closeTunnel(hostKey, true);
              }
            } catch (thenError) {
              this.logger.error(
                `SSH reverse tunnel reconnect callback failed: ${thenError instanceof Error ? thenError.message : String(thenError)}`,
              );
            }
          });
        } catch (timerError) {
          this.logger.error(
            `scheduleReconnect timer failed: ${timerError instanceof Error ? timerError.message : String(timerError)}`,
          );
        }
      }, delay);
    } catch (error) {
      this.logger.error(
        `scheduleReconnect failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns true for SSH failures that will not succeed on retry without
   * changing credentials or server config (e.g. auth rejected).
   *
   * @param message - Error text from ssh2 or a wrapped tunnel result.
   */
  private isPermanentSshFailure(message: string | undefined | null): boolean {
    try {
      if (!message) {
        return false;
      }
      const normalized = message.toLowerCase();
      return (
        normalized.includes("all configured authentication methods failed") ||
        normalized.includes("authentication failure") ||
        normalized.includes("authentication failed") ||
        normalized.includes("permission denied") ||
        normalized.includes("no authentication methods available") ||
        normalized.includes("cannot parse privatekey") ||
        normalized.includes("encrypted private key") ||
        normalized.includes("invalid private key")
      );
    } catch {
      return false;
    }
  }

  /**
   * Ends an SSH client and optionally removes tunnel state for a host.
   *
   * @param hostKey - Normalized host key in `tunnels`.
   * @param intentional - When `true`, marks closing, clears reconnect timer, and deletes state.
   */
  private closeTunnel(hostKey: string, intentional: boolean): void {
    try {
      const state = this.tunnels.get(hostKey);
      if (!state) {
        return;
      }

      if (intentional) {
        state.closing = true;
      }

      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = undefined;
      }

      try {
        state.client.removeAllListeners();
        state.client.end();
      } catch {
        this.logger.warn(`Failed to end SSH tunnel for ${state.options.host}`);
      }

      if (intentional) {
        this.tunnels.delete(hostKey);
      }
    } catch (error) {
      this.logger.error(
        `closeTunnel failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Normalizes a server host string for deduplicating tunnels (one tunnel per host).
   *
   * @param host - Raw `servers.host` value (IP, hostname, or URL).
   * @returns Lowercase normalized hostname/IP used as map key.
   */
  private hostKey(host: string): string {
    try {
      return normalizeServerHostForUrls(host).toLowerCase();
    } catch (error) {
      this.logger.error(
        `hostKey failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return host.trim().toLowerCase();
    }
  }

  /**
   * Resolves the remote reverse-tunnel listen port (`AGENT_SOCKET_TUNNEL_PORT`).
   *
   * Required in the control panel `.env` for self-host tunnels.
   *
   * @returns Parsed port, or a validation error when unset/invalid.
   */
  private remoteTunnelPort(): ParseAgentSocketTunnelPortResult {
    try {
      return readAgentSocketTunnelPortFromEnv((key) =>
        this.configService.get<string>(key),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`remoteTunnelPort failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  /**
   * Resolves the local TCP port the control panel listens on (tunnel forward target).
   *
   * @returns `PORT` from config, or `3000` when unset/invalid.
   */
  private localPanelPort(): number {
    try {
      const raw = this.configService.get<string>("PORT");
      const port = Number(raw);
      return Number.isFinite(port) && port > 0 ? port : 3000;
    } catch (error) {
      this.logger.error(
        `localPanelPort failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 3000;
    }
  }

  /**
   * Builds {@link SshConnectionOptions} from a server row and stored credential.
   *
   * @param server - Server identity and SSH endpoint fields.
   * @param credential - Encrypted password/key from the database.
   * @param plainPrivateKey - Optional onboard-time decrypted private key.
   * @returns Options passed to ssh2 `connect` and tunnel state.
   */
  private buildSshOptions(
    server: Pick<ServerEntity, "id" | "host" | "port" | "username">,
    credential: ServerSshCredentialEntity,
    plainPrivateKey?: string,
  ): SshConnectionOptions {
    try {
      return {
        serverId: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: credential.authType,
        encryptedPassword: credential.encryptedPassword ?? null,
        encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
        privateKey: plainPrivateKey,
        privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
      };
    } catch (error) {
      this.logger.error(
        `buildSshOptions failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Maps {@link SshConnectionOptions} to ssh2 {@link ConnectConfig} with decrypted secrets.
   *
   * @param options - Connection options including encrypted credential fields.
   * @returns Config for `client.connect`, including keepalive for long-lived tunnels.
   */
  private buildConnectConfig(options: SshConnectionOptions): ConnectConfig {
    try {
      const connectConfig: ConnectConfig = {
        host: options.host,
        port: options.port,
        username: options.username,
        readyTimeout: SSH_DEFAULTS.READY_TIMEOUT,
        keepaliveInterval: SSH_DEFAULTS.KEEPALIVE_INTERVAL,
        keepaliveCountMax: SSH_DEFAULTS.KEEPALIVE_COUNT_MAX,
      };

      if (
        options.authType === AUTH_TYPE.PASSWORD ||
        options.encryptedPassword
      ) {
        connectConfig.password = options.encryptedPassword
          ? this.encryptionService.decrypt(options.encryptedPassword)
          : undefined;
      }

      if (options.authType === AUTH_TYPE.PRIVATE_KEY) {
        const key =
          options.privateKey ??
          (options.encryptedPrivateKey
            ? this.encryptionService.decrypt(options.encryptedPrivateKey)
            : undefined);
        connectConfig.privateKey = key;
        if (options.privateKeyPassphrase) {
          connectConfig.passphrase = options.privateKeyPassphrase;
        }
      }

      return connectConfig;
    } catch (error) {
      this.logger.error(
        `buildConnectConfig failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
