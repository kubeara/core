import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "ssh2";

import {
  SshCommandExecutorService,
  SshConnectionManager,
  SshConnectionOptions,
  ExecuteResult,
} from "@shared/ssh";
import { logStructured } from "@shared/common";

import { LocalAgentHostAdapter } from "../adapters/local-agent-host.adapter";
import { SshAgentHostAdapter } from "../adapters/ssh-agent-host.adapter";
import {
  AGENT_INSTALL,
  AGENT_INSTALL_ENV_KEYS,
} from "../constants/agent-install.constants";
import { LOCAL_SERVER } from "../constants/local-server.constants";
import { isSelfHosted } from "../constants/server-connections.constants";
import { AgentHostAdapter } from "../interfaces/agent-host.adapter";
import {
  AgentInstallLogCallback,
  AgentInstallOnHostInput,
  AgentInstallOptions,
  AgentInstallResult,
  RemoteAgentInstallInput,
} from "../interfaces/agent-install.interfaces";
import {
  readAgentComposeFile,
  readAgentPrereqScript,
} from "../utils/agent-deploy-bundle.util";
import { buildRemoveStoppedCanonicalAgentShellCommand } from "../utils/agent-host-cleanup.util";
import { SshTunnelService } from "./ssh-tunnel.service";

export type {
  AgentInstallLogCallback,
  AgentInstallResult,
  RemoteAgentInstallInput,
} from "../interfaces/agent-install.interfaces";

@Injectable()
export class AgentInstallService {
  private readonly logger = new Logger(AgentInstallService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly sshManager: SshConnectionManager,
    private readonly executor: SshCommandExecutorService,
    private readonly sshTunnelService: SshTunnelService,
  ) {}

  resolveLocalInstallDir(): string {
    const fromEnv = process.env.KUBEARA_AGENT_LOCAL_DIR?.trim();
    if (fromEnv) {
      return fromEnv.replace(/\/+$/, "");
    }
    return path.join(os.homedir(), ".kubeara", "agent");
  }

  async installOnLocal(
    input: {
      serverId: string;
    },
    options?: AgentInstallOptions,
  ): Promise<AgentInstallResult> {
    const adapter = new LocalAgentHostAdapter();
    return this.installOnHost(adapter, {
      serverId: input.serverId,
      serverHost: LOCAL_SERVER.HOST,
      installDir: this.resolveLocalInstallDir(),
      controlPanelUrl: isSelfHosted()
        ? `http://host.docker.internal:${this.controlPanelPort}`
        : undefined,
      onLogLine: options?.onLogLine,
    });
  }

  private get controlPanelPort(): number {
    return Number(this.configService.get<string>("PORT") ?? 3410);
  }

  async installOnRemote(
    input: RemoteAgentInstallInput,
    options?: AgentInstallOptions,
  ): Promise<AgentInstallResult> {
    const logs: string[] = [];
    const remoteDir = AGENT_INSTALL.REMOTE_DIR.replace(/\/+$/, "");

    let client: Client | null = null;
    let connectedHere = false;

    try {
      const controlPanelUrl = await this.resolveControlPanelUrlForInstall(
        input.connection.serverId,
      );

      logStructured(
        this.logger,
        "log",
        "agent.install.url_resolved",
        "succeeded",
        {
          module: "AgentInstallService",
          serverId: input.connection.serverId,
          controlPanelUrl,
        },
      );

      const existing = this.sshManager.getConnection(input.connection.serverId);
      if (existing) {
        client = existing;
        this.pushLog(logs, "Reusing open SSH session", options?.onLogLine);
      } else {
        const connectOptions: SshConnectionOptions = {
          ...input.connection,
          privateKey: input.plainPrivateKey ?? input.connection.privateKey,
        };
        client = await this.sshManager.connect(connectOptions);
        connectedHere = true;
        this.pushLog(
          logs,
          "SSH connected for agent install",
          options?.onLogLine,
        );
      }

      const adapter = new SshAgentHostAdapter(client, this.executor);
      const result = await this.installOnHost(adapter, {
        serverId: input.connection.serverId,
        serverHost: input.serverHost.trim(),
        installDir: remoteDir,
        controlPanelUrl,
        onLogLine: options?.onLogLine,
      });

      return {
        ...result,
        logs: [...logs, ...result.logs],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logStructured(this.logger, "warn", "agent.install", "failed", {
        module: "AgentInstallService",
        error: message,
      });
      return {
        success: false,
        logs,
        error: message,
      };
    } finally {
      if (connectedHere && input.connection.serverId) {
        this.sshManager.disconnect(input.connection.serverId);
      }
    }
  }

  /**
   * Resolves the Socket.IO target URL for a remote agent install.
   * Cloud mode keeps the configured CONTROL_PANEL_URL. Self-hosted mode
   * establishes the reverse SSH tunnel plus the stable remote TCP proxy and
   * points the agent at the stable proxy port via host.docker.internal
   * (resolvable from the bridge-networked agent container). The internal
   * tunnel port is never exposed to the agent.
   */
  private async resolveControlPanelUrlForInstall(
    serverId: string,
  ): Promise<string | undefined> {
    if (!isSelfHosted()) {
      return undefined;
    }

    const controlPanelUrl =
      await this.sshTunnelService.getStableControlPanelUrl(serverId);
    if (!controlPanelUrl) {
      throw new Error(
        "Failed to establish stable control panel endpoint for self-hosted agent. " +
          "Check the server SSH connection and control panel logs.",
      );
    }

    const stablePort = Number(controlPanelUrl.split(":").at(-1));
    logStructured(
      this.logger,
      "log",
      "agent.install.stable_url_resolved",
      "succeeded",
      {
        module: "AgentInstallService",
        serverId,
        controlPanelUrl,
        stablePort,
        tunnelPort: this.sshTunnelService.getTunnelPort(serverId),
      },
    );

    return controlPanelUrl;
  }

  /**
   * Prerequisites, compose files, and docker compose up — shared by local and SSH hosts.
   */
  private pushLog(
    logs: string[],
    line: string,
    onLogLine?: AgentInstallLogCallback,
  ): void {
    logs.push(line);
    onLogLine?.(line);
  }

  async installOnHost(
    host: AgentHostAdapter,
    input: AgentInstallOnHostInput,
  ): Promise<AgentInstallResult> {
    const { onLogLine } = input;
    const logs: string[] = [];
    this.pushLog(logs, `Agent install via ${host.label} host`, onLogLine);
    const installDir = input.installDir.replace(/\/+$/, "");
    const composePath = `${installDir}/${AGENT_INSTALL.COMPOSE_FILE}`;
    const envPath = `${installDir}/${AGENT_INSTALL.ENV_FILE}`;

    try {
      logStructured(this.logger, "log", "agent.install", "started", {
        module: "AgentInstallService",
        serverId: input.serverId,
        target: host.label,
      });

      let composeContent: string;
      try {
        composeContent = readAgentComposeFile();
      } catch (err) {
        return {
          success: false,
          logs,
          error: (err as Error).message,
        };
      }

      const prereq = await this.ensurePrerequisites(host, logs, onLogLine);
      if (!prereq.ok) {
        return {
          success: false,
          logs,
          error: prereq.error ?? "Prerequisite installation failed",
        };
      }

      await this.ensureDockerDaemonRunning(host, logs, onLogLine);

      const dockerCli = await this.resolveDockerCli(host, logs, onLogLine);
      if (!dockerCli) {
        this.pushLog(
          logs,
          "Docker still unavailable after prerequisite install",
          onLogLine,
        );
        return {
          success: false,
          logs,
          error:
            "Docker CLI is installed but not reachable (daemon down or socket permissions). Check agentInstall.logs; try reconnecting SSH or use sudo docker on the host.",
        };
      }
      this.pushLog(logs, `Docker CLI ready (${dockerCli.label})`, onLogLine);

      const composeCmd = await this.detectComposeCommand(host, dockerCli);
      if (!composeCmd) {
        this.pushLog(logs, "Docker Compose plugin not found", onLogLine);
        return {
          success: false,
          logs,
          error:
            "Docker Compose is not available on the host after prerequisite install",
        };
      }
      this.pushLog(logs, `Using ${composeCmd}`, onLogLine);

      const agentAlreadyRunning = await this.isAgentContainerRunning(
        host,
        installDir,
        composeCmd,
      );
      const agentContainerPresent =
        agentAlreadyRunning ||
        (await this.isAgentContainerPresent(host, installDir, composeCmd));

      // Resolve host port before any cleanup so docker inspect still works.
      const agentPortResult = await this.resolveAgentHostPort(
        host,
        composeCmd,
        agentAlreadyRunning || agentContainerPresent,
        logs,
        onLogLine,
      );
      if (!agentPortResult.ok) {
        return { success: false, logs, error: agentPortResult.error };
      }
      let agentPort = agentPortResult.port;

      if (agentAlreadyRunning) {
        this.pushLog(
          logs,
          `Agent container ${AGENT_INSTALL.CONTAINER_NAME} is already running, refreshing config and upgrading image`,
          onLogLine,
        );
        logStructured(this.logger, "log", "agent.install", "started", {
          module: "AgentInstallService",
          serverId: input.serverId,
          reason: "upgrade_already_running",
        });
      } else if (agentContainerPresent) {
        this.pushLog(
          logs,
          `Agent container exists but is not running, recreating`,
          onLogLine,
        );
        logStructured(this.logger, "log", "agent.install", "started", {
          module: "AgentInstallService",
          serverId: input.serverId,
          reason: "recreate_stopped_container",
        });
        await this.cleanupStoppedCanonicalAgent(
          host,
          installDir,
          composeCmd,
          logs,
          onLogLine,
        );
      }

      // The agent's CONTROL_PANEL_URL must be written exactly as resolved by the
      // install path: in self-hosted mode it is http://host.docker.internal:<stablePort>
      // (the stable proxy port), reached from the agent container via the
      // host.docker.internal host-gateway alias. It is never rewritten here.
      const finalControlPanelUrl = input.controlPanelUrl;

      // build the agent env file with the resolved stable control panel URL
      const envBuild = this.buildAgentEnvFile(
        input.serverId,
        input.serverHost,
        agentPort,
        finalControlPanelUrl,
        { requireExplicitUrl: isSelfHosted() },
      );
      if (!envBuild.ok) {
        return { success: false, logs, error: envBuild.error };
      }

      this.pushLog(logs, `Agent image: ${envBuild.agentImage}`, onLogLine);

      composeContent = this.prepareAgentComposeContent(composeContent);

      const writeCompose = await host.writeTextFile(
        composePath,
        composeContent,
      );
      if (!writeCompose.ok) {
        return {
          success: false,
          logs,
          error: writeCompose.error ?? `Failed to write ${composePath}`,
        };
      }
      this.pushLog(logs, `Wrote ${composePath}`, onLogLine);

      this.pushLog(
        logs,
        `Writing AGENT_PORT=${agentPort} to ${envPath}`,
        onLogLine,
      );
      this.logger.log(`Writing AGENT_PORT=${agentPort} to ${envPath}`);

      logStructured(
        this.logger,
        "log",
        "agent.install.env_written",
        "succeeded",
        {
          module: "AgentInstallService",
          serverId: input.serverId,
          agentPort,
          controlPanelUrl: finalControlPanelUrl,
        },
      );
      this.pushLog(
        logs,
        `Writing CONTROL_PANEL_URL=${finalControlPanelUrl} to ${envPath}`,
        onLogLine,
      );

      const writeEnv = await host.writeTextFile(envPath, envBuild.content);
      if (!writeEnv.ok) {
        return {
          success: false,
          logs,
          error: writeEnv.error ?? `Failed to write ${envPath}`,
        };
      }
      this.pushLog(logs, `Wrote ${envPath}`, onLogLine);

      const pullResult = await this.pullLatestAgentImage(
        host,
        installDir,
        composeCmd,
        envBuild.agentImage,
        logs,
        onLogLine,
      );
      if (!pullResult.ok) {
        return { success: false, logs, error: pullResult.error };
      }

      const upArgs = agentAlreadyRunning
        ? "up -d --force-recreate --pull always"
        : agentContainerPresent
          ? "up -d --force-recreate --remove-orphans --pull always"
          : "up -d --pull always";

      let up = await host.executeCommand(
        this.buildComposeCommand(installDir, composeCmd, upArgs),
        AGENT_INSTALL.PULL_TIMEOUT_MS,
      );
      this.appendCommandOutput(logs, up, onLogLine);

      if (!up.success && this.isMissingAgentImageError(up)) {
        this.pushLog(
          logs,
          `Agent image missing during compose up, pulling ${envBuild.agentImage} and retrying`,
          onLogLine,
        );
        const retryPull = await this.pullAgentImage(
          host,
          installDir,
          composeCmd,
          logs,
          onLogLine,
        );
        if (!retryPull.success) {
          const imageExists = await this.isAgentImagePresentOnHost(
            host,
            composeCmd,
            envBuild.agentImage,
          );
          if (!imageExists) {
            return this.failFromCommand(
              logs,
              "docker compose pull",
              retryPull,
              onLogLine,
            );
          }
        }
        up = await host.executeCommand(
          this.buildComposeCommand(
            installDir,
            composeCmd,
            "up -d --pull always",
          ),
          AGENT_INSTALL.PULL_TIMEOUT_MS,
        );
        this.appendCommandOutput(logs, up, onLogLine);
      }

      // if the compose up failed, retry with a new agent port to avoid port conflicts
      if (!up.success) {
        if (
          !agentAlreadyRunning &&
          !agentContainerPresent &&
          this.isPortBindError(up)
        ) {
          const retry = await this.retryComposeUpWithNewAgentPort(
            host,
            installDir,
            composeCmd,
            envPath,
            input.serverId,
            input.serverHost,
            input.controlPanelUrl,
            agentPort,
            upArgs,
            logs,
            onLogLine,
            isSelfHosted(),
          );
          if (!retry.ok) {
            return retry.result;
          }
          agentPort = retry.agentPort;
          up = retry.up;
        } else {
          return this.failFromCommand(logs, "docker compose up", up, onLogLine);
        }
      }

      if (!up.success) {
        return this.failFromCommand(logs, "docker compose up", up, onLogLine);
      }

      // check if the agent container is running
      const agentRunning = await this.isAgentContainerRunning(
        host,
        installDir,
        composeCmd,
      );
      if (!agentRunning) {
        this.pushLog(
          logs,
          "Agent container is not running after docker compose up",
          onLogLine,
        );
        return {
          success: false,
          logs,
          error:
            "Agent container failed to start. Check agentInstall.logs on the host (docker logs kubeara-agent).",
        };
      }

      this.pushLog(
        logs,
        agentAlreadyRunning
          ? "Agent container recreated with latest config/image"
          : agentContainerPresent
            ? "Agent container recreated from stopped state"
            : "Agent container started",
        onLogLine,
      );
      this.pushLog(logs, `Agent host port: ${agentPort}`, onLogLine);
      this.logger.log(`Agent host port: ${agentPort}`);

      logStructured(this.logger, "log", "agent.install", "succeeded", {
        module: "AgentInstallService",
        serverId: input.serverId,
        target: host.label,
        reason: agentAlreadyRunning
          ? "upgraded"
          : agentContainerPresent
            ? "recreated"
            : "installed",
        agentPort,
      });

      return { success: true, logs };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logStructured(this.logger, "warn", "agent.install", "failed", {
        module: "AgentInstallService",
        serverId: input.serverId,
        error: message,
      });
      return {
        success: false,
        logs,
        error: message,
      };
    }
  }

  /**
   * Prepares the agent compose content by replacing the PORT variable with the default port.
   * @param composeContent - The compose content to prepare.
   * @returns The prepared compose content.
   */
  private prepareAgentComposeContent(composeContent: string): string {
    return composeContent
      .replace(
        /PORT:\s*\$\{AGENT_PORT(?::-3001)?\}/,
        `PORT: "${AGENT_INSTALL.DEFAULT_PORT}"`,
      )
      .replace(
        /-\s*"\$\{AGENT_PORT(?::-3001)?\}:3001"/,
        '- "${AGENT_PORT}:3001"',
      );
  }

  /**
   * Resolves the agent host port by detecting the existing port from Docker inspect.
   * @param host - The agent host adapter.
   * @param composeCmd - The compose command.
   * @param agentExists - Whether the agent container exists.
   * @param logs - The logs to append.
   * @param onLogLine - The callback to log the result.
   * @returns The resolved agent host port.
   */
  private async resolveAgentHostPort(
    host: AgentHostAdapter,
    composeCmd: string,
    agentExists: boolean,
    logs: string[],
    onLogLine?: AgentInstallLogCallback,
  ): Promise<{ ok: true; port: number } | { ok: false; error: string }> {
    try {
      if (agentExists) {
        this.pushLog(
          logs,
          "Existing agent detected; resolving host port from Docker (3001/tcp)",
          onLogLine,
        );
        this.logger.log(
          "Existing agent detected; resolving host port from Docker (3001/tcp)",
        );
        const existing = await this.detectExistingAgentHostPort(
          host,
          composeCmd,
        );
        if (existing === null) {
          this.pushLog(
            logs,
            "Failed to resolve existing agent host port from Docker inspect",
            onLogLine,
          );
          this.logger.warn(
            "Failed to resolve existing agent host port from Docker inspect",
          );
          return {
            ok: false,
            error:
              "Could not detect the existing agent host port from Docker (3001/tcp mapping). Reinstall after removing the kubeara-agent container, or fix its published port binding.",
          };
        }
        this.pushLog(
          logs,
          `Reusing existing agent host port ${existing}`,
          onLogLine,
        );
        this.logger.log(`Reusing existing agent host port ${existing}`);
        return { ok: true, port: existing };
      }

      this.pushLog(
        logs,
        "No existing agent; selecting a random unused host port (1000-9999)",
        onLogLine,
      );
      this.logger.log(
        "No existing agent; selecting a random unused host port (1000-9999)",
      );
      return await this.selectUnusedAgentHostPort(host, logs, onLogLine);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to resolve agent host port: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        ok: false,
        error: `Unable to resolve agent host port. ${message}`,
      };
    }
  }

  /**
   * Reads the published host port for container 3001/tcp via docker inspect.
   * Docker port bindings are the only source of truth for existing agents.
   * Uses the same Docker CLI mode (direct / sudo / sg) as other install commands.
   */
  private async detectExistingAgentHostPort(
    host: AgentHostAdapter,
    composeCmd: string,
  ): Promise<number | null> {
    try {
      const format =
        '{{with (index .HostConfig.PortBindings "3001/tcp")}}{{(index . 0).HostPort}}{{end}}';
      const args = `inspect -f ${JSON.stringify(format)} ${AGENT_INSTALL.CONTAINER_NAME}`;
      const inspect = await host.executeCommand(
        this.buildDockerCliArgsCommand(composeCmd, args),
        15_000,
      );
      return this.parseHostPort(inspect.stdout);
    } catch (error) {
      this.logger.error(
        "Failed to inspect existing agent host port binding.",
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  /**
   * Selects an unused agent host port by detecting the used ports with ss -H -lnt.
   * @param host - The agent host adapter.
   * @param logs - The logs to append.
   * @param onLogLine - The callback to log the result.
   * @param extraUsed - Additional used ports to consider.
   * @returns The selected unused agent host port.
   */
  private async selectUnusedAgentHostPort(
    host: AgentHostAdapter,
    logs: string[],
    onLogLine?: AgentInstallLogCallback,
    extraUsed: number[] = [],
  ): Promise<{ ok: true; port: number } | { ok: false; error: string }> {
    try {
      this.pushLog(
        logs,
        "Detecting used host ports with: ss -H -lnt",
        onLogLine,
      );
      this.logger.log("Detecting used host ports with: ss -H -lnt");

      const usedResult = await this.collectListeningHostPorts(host);
      if (!usedResult.ok) {
        this.pushLog(
          logs,
          `Used-port detection failed: ${usedResult.error}`,
          onLogLine,
        );
        this.logger.warn(`Used-port detection failed: ${usedResult.error}`);
        return { ok: false, error: usedResult.error };
      }

      const usedPorts = usedResult.ports;
      for (const port of extraUsed) {
        usedPorts.add(port);
      }

      const usedList = [...usedPorts].sort((a, b) => a - b);
      const usedPortsLine = usedList.length
        ? `List of used host ports (${usedList.length}): ${usedList.join(", ")}`
        : "List of used host ports: (none detected)";
      this.pushLog(logs, usedPortsLine, onLogLine);
      this.logger.log(usedPortsLine);

      this.pushLog(
        logs,
        `Generating random unused 4-digit host port (${AGENT_INSTALL.HOST_PORT_MIN}-${AGENT_INSTALL.HOST_PORT_MAX})`,
        onLogLine,
      );
      this.logger.log(
        `Generating random unused 4-digit host port (${AGENT_INSTALL.HOST_PORT_MIN}-${AGENT_INSTALL.HOST_PORT_MAX})`,
      );

      const port = this.pickUnusedHostPort(usedPorts);
      if (port === null) {
        this.pushLog(
          logs,
          `Could not find an unused port after ${AGENT_INSTALL.HOST_PORT_PICK_ATTEMPTS} attempts`,
          onLogLine,
        );
        this.logger.warn(
          `Could not find an unused port after ${AGENT_INSTALL.HOST_PORT_PICK_ATTEMPTS} attempts`,
        );
        return {
          ok: false,
          error: `Could not find an available host port between ${AGENT_INSTALL.HOST_PORT_MIN} and ${AGENT_INSTALL.HOST_PORT_MAX}.`,
        };
      }

      this.pushLog(
        logs,
        `Randomly generated agent host port: ${port}`,
        onLogLine,
      );
      this.logger.log(`Randomly generated agent host port: ${port}`);
      return { ok: true, port };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to select unused agent host port: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        ok: false,
        error: `Unable to select an unused agent host port. ${message}`,
      };
    }
  }

  /**
   * Collects the listening host ports using ss -H -lnt.
   * @param host - The agent host adapter.
   * @returns The collected listening host ports.
   */
  private async collectListeningHostPorts(
    host: AgentHostAdapter,
  ): Promise<{ ok: true; ports: Set<number> } | { ok: false; error: string }> {
    try {
      const result = await host.executeCommand("ss -H -lnt", 30_000);
      if (!result.success) {
        const detail = [result.stderr, result.stdout]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ");
        return {
          ok: false,
          error:
            "Failed to detect listening host ports (ss -H -lnt)." +
            (detail ? ` ${detail}` : ""),
        };
      }

      const ports = new Set<number>();
      for (const line of result.stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        const parts = trimmed.split(/\s+/);
        if (parts.length < 4) {
          continue;
        }
        const local = parts[3];
        const colon = local.lastIndexOf(":");
        if (colon < 0) {
          continue;
        }
        const port = Number.parseInt(local.slice(colon + 1), 10);
        if (Number.isFinite(port) && port >= 1 && port <= 65_535) {
          ports.add(port);
        }
      }

      return { ok: true, ports };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to collect listening host ports: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        ok: false,
        error: `Failed to detect listening host ports (ss -H -lnt). ${message}`,
      };
    }
  }

  /**
   * Picks an unused host port from the given set of used ports.
   * @param usedPorts - The set of used ports.
   * @returns The picked unused host port.
   */
  private pickUnusedHostPort(usedPorts: Set<number>): number | null {
    for (
      let attempt = 0;
      attempt < AGENT_INSTALL.HOST_PORT_PICK_ATTEMPTS;
      attempt++
    ) {
      const port =
        AGENT_INSTALL.HOST_PORT_MIN +
        Math.floor(
          Math.random() *
            (AGENT_INSTALL.HOST_PORT_MAX - AGENT_INSTALL.HOST_PORT_MIN + 1),
        );
      if (!usedPorts.has(port)) {
        return port;
      }
    }
    return null;
  }

  /**
   * Parses a host port from a raw string.
   * @param raw - The raw string to parse.
   * @returns The parsed host port.
   */
  private parseHostPort(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }
    const port = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65_535) {
      return null;
    }
    return port;
  }

  /**
   * Checks if the result contains a port binding error.
   * @param result - The result to check.
   * @returns True if the result contains a port binding error, false otherwise.
   */
  private isPortBindError(result: ExecuteResult): boolean {
    const combined = `${result.stderr}\n${result.stdout}`.toLowerCase();
    return (
      combined.includes("port is already allocated") ||
      combined.includes("address already in use") ||
      combined.includes("bind for")
    );
  }

  /**
   * Retries the compose up with a new agent port to avoid port conflicts.
   * @param host - The agent host adapter.
   * @param installDir - The install directory.
   * @param composeCmd - The compose command.
   * @param envPath - The environment path.
   * @param serverId - The server id.
   * @param serverHost - The server host.
   * @param controlPanelUrl - Optional Socket.IO target URL override (self-hosted tunnel).
   * @param failedPort - The failed port.
   * @param upArgs - The up arguments.
   * @param logs - The logs to append.
   * @param onLogLine - The callback to log the result.
   * @param requireExplicitUrl - When true (self-hosted), a stable URL is mandatory.
   * @returns The result of the compose up.
   */
  private async retryComposeUpWithNewAgentPort(
    host: AgentHostAdapter,
    installDir: string,
    composeCmd: string,
    envPath: string,
    serverId: string,
    serverHost: string,
    controlPanelUrl: string | undefined,
    failedPort: number,
    upArgs: string,
    logs: string[],
    onLogLine?: AgentInstallLogCallback,
    requireExplicitUrl = false,
  ): Promise<
    | { ok: true; agentPort: number; up: ExecuteResult }
    | { ok: false; result: AgentInstallResult }
  > {
    try {
      this.pushLog(
        logs,
        `Agent host port ${failedPort} conflict during compose up; selecting another port`,
        onLogLine,
      );
      this.logger.warn(
        `Agent host port ${failedPort} conflict during compose up; selecting another port`,
      );

      const portResult = await this.selectUnusedAgentHostPort(
        host,
        logs,
        onLogLine,
        [failedPort],
      );
      if (!portResult.ok) {
        return {
          ok: false,
          result: { success: false, logs, error: portResult.error },
        };
      }
      const agentPort = portResult.port;

      const envBuild = this.buildAgentEnvFile(
        serverId,
        serverHost,
        agentPort,
        controlPanelUrl,
        { requireExplicitUrl },
      );
      if (!envBuild.ok) {
        return {
          ok: false,
          result: { success: false, logs, error: envBuild.error },
        };
      }

      const writeEnv = await host.writeTextFile(envPath, envBuild.content);
      if (!writeEnv.ok) {
        return {
          ok: false,
          result: {
            success: false,
            logs,
            error: writeEnv.error ?? `Failed to write ${envPath}`,
          },
        };
      }
      this.pushLog(logs, `Wrote ${envPath}`, onLogLine);

      const up = await host.executeCommand(
        this.buildComposeCommand(installDir, composeCmd, upArgs),
        AGENT_INSTALL.PULL_TIMEOUT_MS,
      );
      this.appendCommandOutput(logs, up, onLogLine);

      if (!up.success) {
        return {
          ok: false,
          result: this.failFromCommand(
            logs,
            "docker compose up",
            up,
            onLogLine,
          ),
        };
      }

      return { ok: true, agentPort, up };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to retry compose up with a new agent port: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        ok: false,
        result: {
          success: false,
          logs,
          error: `Unable to retry agent startup after port conflict. ${message}`,
        },
      };
    }
  }

  /**
   * Builds the agent environment file content.
   * @param serverId - The server id.
   * @param serverHost - The server host.
   * @param agentPort - The agent port.
   * @param controlPanelUrl - Optional Socket.IO target URL override (self-hosted reverse tunnel).
   * @param options.requireExplicitUrl - When true (self-hosted mode), the explicit
   *   controlPanelUrl is mandatory and a loopback URL is rejected, so the remote
   *   agent can never be pointed at 127.0.0.1/localhost.
   * @returns The built agent environment file content.
   */
  private buildAgentEnvFile(
    serverId: string,
    serverHost: string,
    agentPort: number,
    controlPanelUrl?: string,
    options?: { requireExplicitUrl?: boolean },
  ):
    | { ok: true; content: string; agentImage: string }
    | { ok: false; error: string } {
    const normalizedServerId = serverId?.trim();
    if (!normalizedServerId) {
      return {
        ok: false,
        error:
          "Cannot install agent without a server id. " +
          "Ensure the server record exists before provisioning the agent.",
      };
    }

    const requireExplicitUrl = options?.requireExplicitUrl === true;
    const explicitUrl = controlPanelUrl?.trim() || "";

    if (requireExplicitUrl && !explicitUrl) {
      return {
        ok: false,
        error:
          `Cannot install a self-hosted agent without a stable control panel URL. ` +
          `Resolve it via SshTunnelService.getStableControlPanelUrl('${normalizedServerId}') before provisioning.`,
      };
    }
    if (requireExplicitUrl && /(127\.0\.0\.1|localhost)/.test(explicitUrl)) {
      return {
        ok: false,
        error:
          `Refusing to write loopback CONTROL_PANEL_URL '${explicitUrl}' for self-hosted agent '${normalizedServerId}'. ` +
          "Expected http://host.docker.internal:<stablePort> from the stable endpoint.",
      };
    }

    const configuredControlPanelUrl = this.configService.get<string>(
      AGENT_INSTALL_ENV_KEYS.CONTROL_PANEL_URL,
    );
    const controlPanelUrlResolved = (
      explicitUrl ||
      configuredControlPanelUrl?.trim() ||
      ""
    ).trim();
    if (!controlPanelUrlResolved) {
      return {
        ok: false,
        error:
          `Missing ${AGENT_INSTALL_ENV_KEYS.CONTROL_PANEL_URL} on the control panel. ` +
          "Add it to apps/control-panel-app/.env (e.g. http://host.docker.internal:3000 for local agent, or your public URL for remote servers) and restart the app.",
      };
    }

    const encryptionSecret = this.configService.get<string>(
      AGENT_INSTALL_ENV_KEYS.ENCRYPTION_SECRET,
    );
    if (!encryptionSecret?.trim()) {
      return {
        ok: false,
        error: `Missing ${AGENT_INSTALL_ENV_KEYS.ENCRYPTION_SECRET} on the control panel.`,
      };
    }

    const agentImage =
      this.configService.get<string>(
        AGENT_INSTALL_ENV_KEYS.KUBEARA_AGENT_IMAGE,
      ) ?? AGENT_INSTALL.DEFAULT_IMAGE;

    const content = [
      `KUBEARA_AGENT_IMAGE=${agentImage}`,
      `AGENT_PORT=${agentPort}`,
      `CONTROL_PANEL_URL=${controlPanelUrlResolved}`,
      `ENCRYPTION_SECRET=${encryptionSecret}`,
      `KUBEARA_SERVER_ID=${normalizedServerId}`,
      `AGENT_PUBLIC_IP=${serverHost.trim()}`,
      "TRAEFIK_ENABLED=false",
      "DOCKER_PLATFORM=linux/amd64",
      "",
    ].join("\n");

    return { ok: true, content, agentImage };
  }

  /**
   * Pulls the latest agent image from the registry before compose up.
   * Image tag comes from control panel KUBEARA_AGENT_IMAGE (written to remote .env.agent).
   */
  private async pullLatestAgentImage(
    host: AgentHostAdapter,
    installDir: string,
    composeCmd: string,
    agentImage: string,
    logs: string[],
    onLogLine?: AgentInstallLogCallback,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    this.pushLog(
      logs,
      `Pulling latest agent image ${agentImage} from registry`,
      onLogLine,
    );

    const pull = await this.pullAgentImage(
      host,
      installDir,
      composeCmd,
      logs,
      onLogLine,
    );
    if (!pull.success) {
      const stillMissing = !(await this.isAgentImagePresentOnHost(
        host,
        composeCmd,
        agentImage,
      ));
      if (stillMissing) {
        const pullDetail = [pull.stderr, pull.stdout]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ");
        return {
          ok: false,
          error:
            `Failed to pull agent image ${agentImage}.` +
            (pullDetail ? ` ${pullDetail}` : ""),
        };
      }
      this.pushLog(
        logs,
        `Pull failed but image ${agentImage} exists locally, continuing with recreate`,
        onLogLine,
      );
      return { ok: true };
    }

    this.pushLog(logs, "Pulled latest agent image", onLogLine);
    return { ok: true };
  }

  private async pullAgentImage(
    host: AgentHostAdapter,
    installDir: string,
    composeCmd: string,
    logs: string[],
    onLogLine?: AgentInstallLogCallback,
  ): Promise<ExecuteResult> {
    const pull = await host.executeCommand(
      this.buildComposeCommand(installDir, composeCmd, "pull"),
      AGENT_INSTALL.PULL_TIMEOUT_MS,
    );
    this.appendCommandOutput(logs, pull, onLogLine);
    return pull;
  }

  private isMissingAgentImageError(result: ExecuteResult): boolean {
    const combined = `${result.stderr}\n${result.stdout}`.toLowerCase();
    return (
      combined.includes("no such image") ||
      combined.includes("manifest unknown") ||
      combined.includes("pull access denied")
    );
  }

  private async isAgentImagePresentOnHost(
    host: AgentHostAdapter,
    composeCmd: string,
    image: string,
  ): Promise<boolean> {
    const quoted = JSON.stringify(image);
    const probe = await host.executeCommand(
      this.buildDockerImageInspectCommand(composeCmd, quoted),
      15_000,
    );
    return probe.success;
  }

  private buildDockerImageInspectCommand(
    composeMode: string,
    quotedImage: string,
  ): string {
    const args = `image inspect ${quotedImage} >/dev/null 2>&1 && echo ok`;
    switch (composeMode) {
      case "sg":
        return `sg docker -c "docker ${args}"`;
      case "sudo":
        return `sudo -n docker ${args}`;
      default:
        return `docker ${args}`;
    }
  }

  /**
   * Builds a docker CLI command using the resolved invocation mode
   */
  private buildDockerCliArgsCommand(composeMode: string, args: string): string {
    switch (composeMode) {
      case "sg":
        return `sg docker -c ${JSON.stringify(`docker ${args}`)}`;
      case "sudo":
        return `sudo -n docker ${args}`;
      default:
        return `docker ${args}`;
    }
  }

  private emitCommandChunks(
    chunk: string,
    logs: string[],
    onLogLine?: AgentInstallLogCallback,
  ): void {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmed = line.trimEnd();
      if (!trimmed) continue;
      this.pushLog(logs, trimmed, onLogLine);
    }
  }

  private async ensurePrerequisites(
    host: AgentHostAdapter,
    logs: string[],
    onLogLine?: AgentInstallLogCallback,
  ): Promise<{ ok: boolean; error?: string }> {
    let script: string;
    try {
      script = readAgentPrereqScript();
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const elevation = await this.assertElevation(host);
    if (!elevation.ok) {
      return { ok: false, error: elevation.error };
    }
    this.pushLog(logs, elevation.log, onLogLine);

    this.pushLog(
      logs,
      "Running ensure-agent-prerequisites.sh (may take several minutes)...",
      onLogLine,
    );

    const write = await host.writeTextFile(
      AGENT_INSTALL.PREREQ_REMOTE_PATH,
      script,
    );
    if (!write.ok) {
      return {
        ok: false,
        error: write.error ?? "Failed to write prerequisite script",
      };
    }

    await host.executeCommand(`chmod +x ${AGENT_INSTALL.PREREQ_REMOTE_PATH}`);

    const prereqCommand = `bash ${AGENT_INSTALL.PREREQ_REMOTE_PATH}`;
    const run =
      host instanceof SshAgentHostAdapter
        ? await host.executeCommandStreaming(
            prereqCommand,
            AGENT_INSTALL.PREREQ_TIMEOUT_MS,
            (chunk) => this.emitCommandChunks(chunk, logs, onLogLine),
          )
        : await host.executeCommand(
            prereqCommand,
            AGENT_INSTALL.PREREQ_TIMEOUT_MS,
          );

    if (!(host instanceof SshAgentHostAdapter)) {
      this.appendCommandOutput(logs, run, onLogLine);
    }

    if (!run.success) {
      const needsSudoPassword =
        run.stderr.includes("sudo: a password is required") ||
        run.stderr.includes("a terminal is required to read the password");
      return {
        ok: false,
        error: needsSudoPassword
          ? "User needs passwordless sudo (or run as root). On the server: echo 'USER ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/kubeara-agent"
          : run.stderr.includes("SSH-in-Docker test hosts") ||
              run.stdout.includes("/.dockerenv") ||
              run.stderr.includes("container without a working local Docker")
            ? "This host cannot run a local Docker daemon (e.g. SSH-in-Docker test container). Use a real machine or VPS. See deploy/README.md."
            : "Prerequisite install failed. See logs for [agent-prereq] output.",
      };
    }

    this.pushLog(logs, "Prerequisites OK", onLogLine);
    return { ok: true };
  }

  private async assertElevation(
    host: AgentHostAdapter,
  ): Promise<{ ok: boolean; log: string; error?: string }> {
    const probe = await host.executeCommand(
      'if [ "$(id -u)" -eq 0 ]; then echo root; elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then echo sudo; else echo none; fi',
    );
    const mode = probe.stdout.trim();
    if (mode === "root") {
      return { ok: true, log: "Elevation: root" };
    }
    if (mode === "sudo") {
      return { ok: true, log: "Elevation: passwordless sudo" };
    }
    if (host.label === "local") {
      return {
        ok: true,
        log: "Elevation: local user (Docker Desktop / user install)",
      };
    }
    return {
      ok: false,
      log: "Elevation: none",
      error:
        "SSH user cannot install packages: need root or passwordless sudo. " +
        "On Alpine/Debian: echo 'myuser ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/myuser",
    };
  }

  private async ensureDockerDaemonRunning(
    host: AgentHostAdapter,
    logs: string[],
    onLogLine?: AgentInstallLogCallback,
  ): Promise<void> {
    const start = await host.executeCommand(
      [
        "sudo -n sh -c '",
        "if command -v rc-service >/dev/null 2>&1; then rc-service docker start 2>/dev/null; fi; ",
        "if command -v service >/dev/null 2>&1; then service docker start 2>/dev/null; fi; ",
        "if command -v systemctl >/dev/null 2>&1; then systemctl start docker 2>/dev/null; fi; ",
        "if ! docker ps >/dev/null 2>&1 && command -v dockerd >/dev/null 2>&1; then dockerd >/var/log/dockerd.log 2>&1 & sleep 2; fi; ",
        "true'",
      ].join(""),
    );
    if (start.success) {
      this.pushLog(logs, "Attempted to start Docker daemon", onLogLine);
    }
  }

  private async resolveDockerCli(
    host: AgentHostAdapter,
    logs: string[],
    onLogLine?: AgentInstallLogCallback,
  ): Promise<{ mode: "direct" | "sudo" | "sg"; label: string } | null> {
    if (await this.dockerPs(host, "docker")) {
      return { mode: "direct", label: "docker" };
    }

    this.pushLog(
      logs,
      "docker ps failed as current user (often needs new login for docker group)",
      onLogLine,
    );

    if (await this.dockerPs(host, "sudo -n docker")) {
      return { mode: "sudo", label: "sudo docker" };
    }

    const sg = await host.executeCommand(
      'command -v docker >/dev/null 2>&1 && sg docker -c "docker ps >/dev/null 2>&1" && echo ok',
    );
    if (sg.success) {
      this.pushLog(
        logs,
        "Using sg docker for docker compose (docker group not active in this session)",
        onLogLine,
      );
      return { mode: "sg", label: "sg docker" };
    }

    const diag = await host.executeCommand(
      "command -v docker; sudo -n docker ps 2>&1; id; groups 2>&1",
    );
    this.appendCommandOutput(logs, diag, onLogLine);

    return null;
  }

  private async dockerPs(
    host: AgentHostAdapter,
    dockerInvocation: string,
  ): Promise<boolean> {
    const check = await host.executeCommand(
      `command -v docker >/dev/null 2>&1 && ${dockerInvocation} ps >/dev/null 2>&1 && echo ok`,
    );
    return check.success;
  }

  private async detectComposeCommand(
    host: AgentHostAdapter,
    dockerCli: { mode: "direct" | "sudo" | "sg"; label: string },
  ): Promise<string | null> {
    if (dockerCli.mode === "sg") {
      const probe = await host.executeCommand(
        'sg docker -c "docker compose version >/dev/null 2>&1" && echo ok',
      );
      return probe.success ? "sg" : null;
    }

    const prefix = dockerCli.mode === "sudo" ? "sudo -n docker" : "docker";
    const probe = await host.executeCommand(
      `command -v docker >/dev/null 2>&1 && ${prefix} compose version >/dev/null 2>&1 && echo ok`,
    );
    return probe.success ? dockerCli.mode : null;
  }

  /**
   * Removes stopped or Created canonical kubeara-agent containers before compose recreate.
   *
   * @param host - Local or SSH host adapter executing docker commands.
   * @param installDir - Remote/local agent install directory.
   * @param composeCmd - Docker invocation mode: direct, sudo, or sg.
   * @param logs - Install log buffer appended in place.
   * @param onLogLine - Optional live log callback.
   */
  private async cleanupStoppedCanonicalAgent(
    host: AgentHostAdapter,
    installDir: string,
    composeCmd: string,
    logs: string[],
    onLogLine?: AgentInstallLogCallback,
  ): Promise<void> {
    const removeStopped = await host.executeCommand(
      this.buildDockerShellCommand(
        composeCmd,
        buildRemoveStoppedCanonicalAgentShellCommand(),
      ),
      30_000,
    );
    this.appendCommandOutput(logs, removeStopped, onLogLine);

    if (removeStopped.success) {
      this.pushLog(
        logs,
        "Removed stopped kubeara-agent container before recreate",
        onLogLine,
      );
    }
  }

  /**
   * Wraps a shell script for docker execution under direct, sudo, or sg docker modes.
   *
   * @param composeMode - Docker invocation mode from detectComposeCommand().
   * @param script - Shell script body to execute.
   * @returns Full shell command string.
   */
  private buildDockerShellCommand(composeMode: string, script: string): string {
    switch (composeMode) {
      case "sg":
        return `sg docker -c ${JSON.stringify(script)}`;
      case "sudo":
        return `sudo -n bash -lc ${JSON.stringify(script)}`;
      default:
        return `bash -lc ${JSON.stringify(script)}`;
    }
  }

  /**
   * Returns true when any kubeara-agent container exists on the host (any Docker state).
   *
   * @param host - Local or SSH host adapter.
   * @param installDir - Agent compose directory on the host.
   * @param composeCmd - Docker invocation mode.
   */
  private async isAgentContainerPresent(
    host: AgentHostAdapter,
    installDir: string,
    composeCmd: string,
  ): Promise<boolean> {
    const byName = await host.executeCommand(
      this.buildDockerPsFilterCommand(
        composeCmd,
        AGENT_INSTALL.CONTAINER_NAME,
        false,
      ),
      15_000,
    );
    if (byName.success && byName.stdout.trim().length > 0) {
      return true;
    }

    const byCompose = await host.executeCommand(
      this.buildComposeCommand(installDir, composeCmd, "ps -a -q"),
      15_000,
    );
    return byCompose.success && byCompose.stdout.trim().length > 0;
  }

  private async isAgentContainerRunning(
    host: AgentHostAdapter,
    installDir: string,
    composeCmd: string,
  ): Promise<boolean> {
    const byName = await host.executeCommand(
      this.buildDockerPsFilterCommand(
        composeCmd,
        AGENT_INSTALL.CONTAINER_NAME,
        true,
      ),
      15_000,
    );
    if (byName.success && byName.stdout.trim().length > 0) {
      return true;
    }

    const byCompose = await host.executeCommand(
      this.buildComposeCommand(
        installDir,
        composeCmd,
        "ps --status running -q",
      ),
      15_000,
    );
    return byCompose.success && byCompose.stdout.trim().length > 0;
  }

  /**
   * Builds a docker ps filter command for kubeara-agent containers.
   *
   * @param composeMode - Docker invocation mode.
   * @param containerName - Container name filter (matches prefixed orphans too).
   * @param runningOnly - When true, limits results to running containers.
   */
  private buildDockerPsFilterCommand(
    composeMode: string,
    containerName: string,
    runningOnly: boolean,
  ): string {
    const statusFilter = runningOnly ? ' --filter "status=running"' : "";
    const args = `ps -a --filter "name=${containerName}"${statusFilter} -q`;
    switch (composeMode) {
      case "sg":
        return `sg docker -c "docker ${args}"`;
      case "sudo":
        return `sudo -n docker ${args}`;
      default:
        return `docker ${args}`;
    }
  }

  /**
   * Builds a docker compose command using a fixed project name (-p agent).
   *
   * @param installDir - Working directory containing compose and env files.
   * @param composeMode - Docker invocation mode.
   * @param subcommand - Compose subcommand (e.g. up -d, down --remove-orphans).
   */
  private buildComposeCommand(
    installDir: string,
    composeMode: string,
    subcommand: string,
  ): string {
    const base = `-f ${AGENT_INSTALL.COMPOSE_FILE} --env-file ${AGENT_INSTALL.ENV_FILE} -p ${AGENT_INSTALL.COMPOSE_PROJECT_NAME} ${subcommand}`;
    switch (composeMode) {
      case "sg":
        return `cd ${installDir} && sg docker -c "docker compose ${base}"`;
      case "sudo":
        return `cd ${installDir} && sudo -n docker compose ${base}`;
      default:
        return `cd ${installDir} && docker compose ${base}`;
    }
  }

  private appendCommandOutput(
    logs: string[],
    result: ExecuteResult,
    onLogLine?: AgentInstallLogCallback,
  ): void {
    const combined = [result.stdout, result.stderr]
      .join("\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    for (const line of combined) {
      this.pushLog(logs, line, onLogLine);
    }
  }

  private failFromCommand(
    logs: string[],
    step: string,
    result: ExecuteResult,
    onLogLine?: AgentInstallLogCallback,
  ): AgentInstallResult {
    const detail = [result.stderr, result.stdout]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n");
    this.pushLog(
      logs,
      `${step} failed (exit ${result.exitCode ?? "?"})`,
      onLogLine,
    );
    return {
      success: false,
      logs,
      error: detail || `${step} failed`,
    };
  }
}
