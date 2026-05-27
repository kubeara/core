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

interface AgentInstallOnHostInput {
  serverId: string;
  serverHost: string;
  installDir: string;
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

  async installOnLocal(input: {
    serverId: string;
  }): Promise<AgentInstallResult> {
    const adapter = new LocalAgentHostAdapter();
    return this.installOnHost(adapter, {
      serverId: input.serverId,
      serverHost: LOCAL_SERVER.HOST,
      installDir: this.resolveLocalInstallDir(),
    });
  }

  async installOnRemote(
    input: RemoteAgentInstallInput,
  ): Promise<AgentInstallResult> {
    const logs: string[] = [];
    const remoteDir = AGENT_INSTALL.REMOTE_DIR.replace(/\/+$/, "");

    let client: Client | null = null;
    let connectedHere = false;

    try {
      const existing = this.sshManager.getConnection(input.connection.serverId);
      if (existing) {
        client = existing;
        logs.push("Reusing open SSH session");
      } else {
        const connectOptions: SshConnectionOptions = {
          ...input.connection,
          privateKey: input.plainPrivateKey ?? input.connection.privateKey,
        };
        client = await this.sshManager.connect(connectOptions);
        connectedHere = true;
        logs.push("SSH connected for agent install");
      }

      const adapter = new SshAgentHostAdapter(client, this.executor);
      const result = await this.installOnHost(adapter, {
        serverId: input.connection.serverId,
        serverHost: input.serverHost.trim(),
        installDir: remoteDir,
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
  async installOnHost(
    host: AgentHostAdapter,
    input: AgentInstallOnHostInput,
  ): Promise<AgentInstallResult> {
    const logs: string[] = [`Agent install via ${host.label} host`];
    const installDir = input.installDir.replace(/\/+$/, "");
    const composePath = `${installDir}/${AGENT_INSTALL.COMPOSE_FILE}`;
    const envPath = `${installDir}/${AGENT_INSTALL.ENV_FILE}`;

    try {
      const envBuild = this.buildAgentEnvFile(input.serverId, input.serverHost);
      if (!envBuild.ok) {
        return { success: false, logs, error: envBuild.error };
      }

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

      const prereq = await this.ensurePrerequisites(host, logs);
      if (!prereq.ok) {
        return {
          success: false,
          logs,
          error: prereq.error ?? "Prerequisite installation failed",
        };
      }

      await this.ensureDockerDaemonRunning(host, logs);

      const dockerCli = await this.resolveDockerCli(host, logs);
      if (!dockerCli) {
        return {
          success: false,
          logs: [
            ...logs,
            "Docker still unavailable after prerequisite install",
          ],
          error:
            "Docker CLI is installed but not reachable (daemon down or socket permissions). Check agentInstall.logs; try reconnecting SSH or use sudo docker on the host.",
        };
      }
      logs.push(`Docker CLI ready (${dockerCli.label})`);

      const composeCmd = await this.detectComposeCommand(host, dockerCli);
      if (!composeCmd) {
        return {
          success: false,
          logs: [...logs, "Docker Compose plugin not found"],
          error:
            "Docker Compose is not available on the host after prerequisite install",
        };
      }
      logs.push(`Using ${composeCmd}`);

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
      logs.push(`Wrote ${composePath}`);

      const writeEnv = await host.writeTextFile(envPath, envBuild.content);
      if (!writeEnv.ok) {
        return {
          success: false,
          logs,
          error: writeEnv.error ?? `Failed to write ${envPath}`,
        };
      }
      logs.push(`Wrote ${envPath}`);

      const pull = await host.executeCommand(
        this.buildComposeCommand(installDir, composeCmd, "pull"),
        AGENT_INSTALL.PULL_TIMEOUT_MS,
      );
      if (!pull.success) {
        return this.failFromCommand(logs, "docker compose pull", pull);
      }
      logs.push("Pulled agent image");

      const up = await host.executeCommand(
        this.buildComposeCommand(installDir, composeCmd, "up -d"),
        AGENT_INSTALL.PULL_TIMEOUT_MS,
      );
      if (!up.success) {
        return this.failFromCommand(logs, "docker compose up", up);
      }
      logs.push("Agent container started");

      this.logger.log(
        `Agent installed serverId=${input.serverId} dir=${installDir} host=${host.label}`,
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
  ): { ok: true; content: string } | { ok: false; error: string } {
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

    return { ok: true, content };
  }

  private async ensurePrerequisites(
    host: AgentHostAdapter,
    logs: string[],
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
    logs.push(elevation.log);

    logs.push(
      "Running ensure-agent-prerequisites.sh (may take several minutes)...",
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

    const run = await host.executeCommand(
      `bash ${AGENT_INSTALL.PREREQ_REMOTE_PATH}`,
      AGENT_INSTALL.PREREQ_TIMEOUT_MS,
    );
    this.appendCommandOutput(logs, run);

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

    logs.push("Prerequisites OK");
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
      logs.push("Attempted to start Docker daemon");
    }
  }

  private async resolveDockerCli(
    host: AgentHostAdapter,
    logs: string[],
  ): Promise<{ mode: "direct" | "sudo" | "sg"; label: string } | null> {
    if (await this.dockerPs(host, "docker")) {
      return { mode: "direct", label: "docker" };
    }

    logs.push(
      "docker ps failed as current user (often needs new login for docker group)",
    );

    if (await this.dockerPs(host, "sudo -n docker")) {
      return { mode: "sudo", label: "sudo docker" };
    }

    const sg = await host.executeCommand(
      'command -v docker >/dev/null 2>&1 && sg docker -c "docker ps >/dev/null 2>&1" && echo ok',
    );
    if (sg.success) {
      logs.push(
        "Using sg docker for docker compose (docker group not active in this session)",
      );
      return { mode: "sg", label: "sg docker" };
    }

    const diag = await host.executeCommand(
      "command -v docker; sudo -n docker ps 2>&1; id; groups 2>&1",
    );
    this.appendCommandOutput(logs, diag);

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

  private buildComposeCommand(
    installDir: string,
    composeMode: string,
    subcommand: string,
  ): string {
    const base = `-f ${AGENT_INSTALL.COMPOSE_FILE} --env-file ${AGENT_INSTALL.ENV_FILE} ${subcommand}`;
    switch (composeMode) {
      case "sg":
        return `cd ${installDir} && sg docker -c "docker compose ${base}"`;
      case "sudo":
        return `cd ${installDir} && sudo -n docker compose ${base}`;
      default:
        return `cd ${installDir} && docker compose ${base}`;
    }
  }

  private appendCommandOutput(logs: string[], result: ExecuteResult): void {
    const combined = [result.stdout, result.stderr]
      .join("\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    const tail = combined.slice(-40);
    for (const line of tail) {
      logs.push(line);
    }
  }

  private failFromCommand(
    logs: string[],
    step: string,
    result: ExecuteResult,
  ): AgentInstallResult {
    const detail = [result.stderr, result.stdout]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n");
    return {
      success: false,
      logs: [...logs, `${step} failed (exit ${result.exitCode ?? "?"})`],
      error: detail || `${step} failed`,
    };
  }
}
