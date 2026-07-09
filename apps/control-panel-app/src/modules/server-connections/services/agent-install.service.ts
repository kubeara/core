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

import { LocalAgentHostAdapter } from "../adapters/local-agent-host.adapter";
import { SshAgentHostAdapter } from "../adapters/ssh-agent-host.adapter";
import {
  AGENT_INSTALL,
  AGENT_INSTALL_ENV_KEYS,
} from "../constants/agent-install.constants";
import { LOCAL_SERVER } from "../constants/local-server.constants";
import { AgentHostAdapter } from "../interfaces/agent-host.adapter";
import {
  readAgentComposeFile,
  readAgentPrereqScript,
} from "../utils/agent-deploy-bundle.util";
import { buildRemoveStoppedCanonicalAgentShellCommand } from "../utils/agent-host-cleanup.util";

export interface RemoteAgentInstallInput {
  connection: SshConnectionOptions;
  serverHost: string;
  plainPrivateKey?: string;
}

export interface AgentInstallResult {
  success: boolean;
  logs: string[];
  error?: string;
  skipped?: boolean;
}

export type AgentInstallLogCallback = (line: string) => void;

interface AgentInstallOnHostInput {
  serverId: string;
  serverHost: string;
  installDir: string;
  onLogLine?: AgentInstallLogCallback;
}

interface AgentInstallOptions {
  onLogLine?: AgentInstallLogCallback;
}

@Injectable()
export class AgentInstallService {
  private readonly logger = new Logger(AgentInstallService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly sshManager: SshConnectionManager,
    private readonly executor: SshCommandExecutorService,
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
      onLogLine: options?.onLogLine,
    });
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
        onLogLine: options?.onLogLine,
      });

      return {
        ...result,
        logs: [...logs, ...result.logs],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Remote agent install failed: ${message}`);
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
      const envBuild = this.buildAgentEnvFile(input.serverId, input.serverHost);
      if (!envBuild.ok) {
        return { success: false, logs, error: envBuild.error };
      }

      this.pushLog(logs, `Agent image: ${envBuild.agentImage}`, onLogLine);
      this.logger.log(
        `Agent install using image=${envBuild.agentImage} serverId=${input.serverId} host=${host.label}`,
      );

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

      if (agentAlreadyRunning) {
        this.pushLog(
          logs,
          `Agent container ${AGENT_INSTALL.CONTAINER_NAME} is already running — refreshing config and upgrading image`,
          onLogLine,
        );
        this.logger.log(
          `Agent upgrade (already running) serverId=${input.serverId} image=${envBuild.agentImage} dir=${installDir}`,
        );
      } else if (agentContainerPresent) {
        this.pushLog(
          logs,
          `Agent container exists but is not running — recreating`,
          onLogLine,
        );
        this.logger.log(
          `Agent recreate (stopped) serverId=${input.serverId} image=${envBuild.agentImage} dir=${installDir}`,
        );
        await this.cleanupStoppedCanonicalAgent(
          host,
          installDir,
          composeCmd,
          logs,
          onLogLine,
        );
      }

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

      const writeEnv = await host.writeTextFile(envPath, envBuild.content);
      if (!writeEnv.ok) {
        return {
          success: false,
          logs,
          error: writeEnv.error ?? `Failed to write ${envPath}`,
        };
      }
      this.pushLog(logs, `Wrote ${envPath}`, onLogLine);

      const skipPull =
        this.configService.get<string>("KUBEARA_AGENT_SKIP_PULL") === "true";

      if (skipPull) {
        this.pushLog(
          logs,
          "Skipping docker compose pull (KUBEARA_AGENT_SKIP_PULL=true — use a locally loaded image)",
          onLogLine,
        );
      } else {
        const pull = await host.executeCommand(
          this.buildComposeCommand(installDir, composeCmd, "pull"),
          AGENT_INSTALL.PULL_TIMEOUT_MS,
        );
        this.appendCommandOutput(logs, pull, onLogLine);
        if (!pull.success) {
          const imageExists = await this.isAgentImagePresentOnHost(
            host,
            composeCmd,
            envBuild.agentImage,
          );
          if (!imageExists) {
            return this.failFromCommand(
              logs,
              "docker compose pull",
              pull,
              onLogLine,
            );
          }
          this.pushLog(
            logs,
            `Pull failed but image ${envBuild.agentImage} exists locally — continuing`,
            onLogLine,
          );
        } else {
          this.pushLog(logs, "Pulled agent image", onLogLine);
        }
      }

      /**
       * The compose up arguments.
       */
      const upArgs = agentAlreadyRunning
        ? "up -d --force-recreate --pull never"
        : agentContainerPresent
          ? "up -d --force-recreate --remove-orphans --pull never"
          : skipPull
            ? "up -d --pull never"
            : "up -d";

      const up = await host.executeCommand(
        this.buildComposeCommand(installDir, composeCmd, upArgs),
        AGENT_INSTALL.PULL_TIMEOUT_MS,
      );
      this.appendCommandOutput(logs, up, onLogLine);
      if (!up.success) {
        return this.failFromCommand(logs, "docker compose up", up, onLogLine);
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

      this.logger.log(
        `Agent ${agentAlreadyRunning ? "upgraded" : agentContainerPresent ? "recreated" : "installed"} serverId=${input.serverId} image=${envBuild.agentImage} dir=${installDir} host=${host.label}`,
      );

      return { success: true, logs };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Agent install failed: ${message}`);
      return {
        success: false,
        logs,
        error: message,
      };
    }
  }

  private buildAgentEnvFile(
    serverId: string,
    serverHost: string,
  ):
    | { ok: true; content: string; agentImage: string }
    | { ok: false; error: string } {
    const controlPanelUrl = this.configService.get<string>(
      AGENT_INSTALL_ENV_KEYS.CONTROL_PANEL_URL,
    );
    if (!controlPanelUrl?.trim()) {
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
      `AGENT_PORT=${AGENT_INSTALL.DEFAULT_PORT}`,
      `CONTROL_PANEL_URL=${controlPanelUrl.trim()}`,
      `ENCRYPTION_SECRET=${encryptionSecret}`,
      `KUBEARA_SERVER_ID=${serverId}`,
      `AGENT_PUBLIC_IP=${serverHost.trim()}`,
      "TRAEFIK_ENABLED=false",
      "DOCKER_PLATFORM=linux/amd64",
      "",
    ].join("\n");

    return { ok: true, content, agentImage };
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
