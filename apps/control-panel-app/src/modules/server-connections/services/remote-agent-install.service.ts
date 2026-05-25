import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "ssh2";

import {
  SshCommandExecutorService,
  SshConnectionManager,
  SshConnectionOptions,
} from "@shared/ssh";

import {
  AGENT_INSTALL,
  AGENT_INSTALL_ENV_KEYS,
} from "../constants/agent-install.constants";
import {
  readAgentComposeFile,
  readAgentPrereqScript,
} from "../utils/agent-deploy-bundle.util";
import { buildBase64WriteCommand } from "../utils/remote-file.util";
import { ExecuteResult } from "@shared/ssh";

export interface RemoteAgentInstallInput {
  connection: SshConnectionOptions;
  /** Public host/IP of the remote server (used for AGENT_PUBLIC_IP). */
  serverHost: string;
  /** Plain private key from onboard request when not yet only in DB. */
  plainPrivateKey?: string;
}

export interface AgentInstallResult {
  success: boolean;
  logs: string[];
  error?: string;
  skipped?: boolean;
}

@Injectable()
export class RemoteAgentInstallService {
  private readonly logger = new Logger(RemoteAgentInstallService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly sshManager: SshConnectionManager,
    private readonly executor: SshCommandExecutorService,
  ) {}

  async install(input: RemoteAgentInstallInput): Promise<AgentInstallResult> {
    const logs: string[] = [];
    const remoteDir = AGENT_INSTALL.REMOTE_DIR.replace(/\/+$/, "");
    const composeRemotePath = `${remoteDir}/${AGENT_INSTALL.COMPOSE_FILE}`;
    const envRemotePath = `${remoteDir}/${AGENT_INSTALL.ENV_FILE}`;

    let client: Client | null = null;
    let connectedHere = false;

    try {
      const controlPanelUrl = this.configService.get<string>(
        AGENT_INSTALL_ENV_KEYS.CONTROL_PANEL_URL,
      );
      if (!controlPanelUrl?.trim()) {
        return {
          success: false,
          logs,
          error:
            `Missing ${AGENT_INSTALL_ENV_KEYS.CONTROL_PANEL_URL} on the control panel. ` +
            "Add it to apps/control-panel-app/.env (e.g. http://YOUR_PUBLIC_IP:3000 for remote servers) and restart the app.",
        };
      }

      const encryptionSecret = this.configService.get<string>(
        AGENT_INSTALL_ENV_KEYS.ENCRYPTION_SECRET,
      );
      if (!encryptionSecret?.trim()) {
        return {
          success: false,
          logs,
          error: `Missing ${AGENT_INSTALL_ENV_KEYS.ENCRYPTION_SECRET} on the control panel.`,
        };
      }

      const agentImage =
        this.configService.get<string>(
          AGENT_INSTALL_ENV_KEYS.KUBEARA_AGENT_IMAGE,
        ) ?? AGENT_INSTALL.DEFAULT_IMAGE;

      const envFileContent = [
        `KUBEARA_AGENT_IMAGE=${agentImage}`,
        `AGENT_PORT=${AGENT_INSTALL.DEFAULT_PORT}`,
        `CONTROL_PANEL_URL=${controlPanelUrl.trim()}`,
        `ENCRYPTION_SECRET=${encryptionSecret}`,
        `AGENT_PUBLIC_IP=${input.serverHost.trim()}`,
        "TRAEFIK_ENABLED=false",
        "DOCKER_PLATFORM=linux/amd64",
        "",
      ].join("\n");

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

      const prereq = await this.ensureRemotePrerequisites(client, logs);
      if (!prereq.ok) {
        return {
          success: false,
          logs,
          error: prereq.error ?? "Prerequisite installation failed",
        };
      }

      await this.ensureDockerDaemonRunning(client, logs);

      const dockerCli = await this.resolveDockerCli(client, logs);
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

      const composeCmd = await this.detectComposeCommand(client, dockerCli);
      if (!composeCmd) {
        return {
          success: false,
          logs: [...logs, "Docker Compose plugin not found"],
          error:
            "Docker Compose is not available on the remote server after prerequisite install",
        };
      }
      logs.push(`Using ${composeCmd}`);

      const writeCompose = await this.executor.executeCommand(
        client,
        buildBase64WriteCommand(composeRemotePath, composeContent),
      );
      if (!writeCompose.success) {
        return this.failFromCommand(logs, "write compose file", writeCompose);
      }
      logs.push(`Wrote ${composeRemotePath}`);

      const writeEnv = await this.executor.executeCommand(
        client,
        buildBase64WriteCommand(envRemotePath, envFileContent),
      );
      if (!writeEnv.success) {
        return this.failFromCommand(logs, "write .env.agent", writeEnv);
      }
      logs.push(`Wrote ${envRemotePath}`);

      const pull = await this.executor.executeCommand(
        client,
        this.buildComposeCommand(remoteDir, composeCmd, "pull"),
        AGENT_INSTALL.PULL_TIMEOUT_MS,
      );
      if (!pull.success) {
        return this.failFromCommand(logs, "docker compose pull", pull);
      }
      logs.push("Pulled agent image");

      const up = await this.executor.executeCommand(
        client,
        this.buildComposeCommand(remoteDir, composeCmd, "up -d"),
        AGENT_INSTALL.PULL_TIMEOUT_MS,
      );
      if (!up.success) {
        return this.failFromCommand(logs, "docker compose up", up);
      }
      logs.push("Agent container started");

      this.logger.log(
        `Agent installed on server=${input.connection.serverId} host=${input.connection.host}`,
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
    } finally {
      if (connectedHere && input.connection.serverId) {
        this.sshManager.disconnect(input.connection.serverId);
      }
    }
  }

  private async assertRemoteElevation(
    client: Client,
  ): Promise<{ ok: boolean; log: string; error?: string }> {
    const probe = await this.executor.executeCommand(
      client,
      'if [ "$(id -u)" -eq 0 ]; then echo root; elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then echo sudo; else echo none; fi',
    );
    const mode = probe.stdout.trim();
    if (mode === "root") {
      return { ok: true, log: "Remote elevation: root" };
    }
    if (mode === "sudo") {
      return { ok: true, log: "Remote elevation: passwordless sudo" };
    }
    return {
      ok: false,
      log: "Remote elevation: none",
      error:
        "SSH user cannot install packages: need root or passwordless sudo. " +
        "On Alpine/Debian: echo 'myuser ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/myuser",
    };
  }

  private async ensureRemotePrerequisites(
    client: Client,
    logs: string[],
  ): Promise<{ ok: boolean; error?: string }> {
    let script: string;
    try {
      script = readAgentPrereqScript();
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const elevation = await this.assertRemoteElevation(client);
    if (!elevation.ok) {
      return { ok: false, error: elevation.error };
    }
    logs.push(elevation.log);

    logs.push(
      "Running ensure-agent-prerequisites.sh on remote host (may take several minutes)...",
    );

    const write = await this.executor.executeCommand(
      client,
      buildBase64WriteCommand(AGENT_INSTALL.PREREQ_REMOTE_PATH, script),
      AGENT_INSTALL.PREREQ_TIMEOUT_MS,
    );
    if (!write.success) {
      return {
        ok: false,
        error: "Failed to upload prerequisite script to remote host",
      };
    }

    await this.executor.executeCommand(
      client,
      `chmod +x ${AGENT_INSTALL.PREREQ_REMOTE_PATH}`,
    );

    const run = await this.executor.executeCommand(
      client,
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
          ? "Remote user needs passwordless sudo (or connect as root). On the server: echo 'USER ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/kubeara-agent"
          : run.stderr.includes("SSH-in-Docker test hosts") ||
              run.stdout.includes("/.dockerenv") ||
              run.stderr.includes("container without a working local Docker")
            ? "This host looks like a Docker SSH test container (no dockerd). Use a real VPS for agent install, or onboard with installAgent:false. See deploy/README.md."
            : "Prerequisite install failed. See logs for [agent-prereq] output.",
      };
    }

    logs.push("Remote prerequisites OK");
    return { ok: true };
  }

  private async ensureDockerDaemonRunning(
    client: Client,
    logs: string[],
  ): Promise<void> {
    const start = await this.executor.executeCommand(
      client,
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

  /** How to invoke docker on the remote host (group/sudo/session quirks after fresh install). */
  private async resolveDockerCli(
    client: Client,
    logs: string[],
  ): Promise<{ mode: "direct" | "sudo" | "sg"; label: string } | null> {
    if (!(await this.remoteDockerPs(client, "docker"))) {
      logs.push(
        "docker ps failed as current user (often needs new SSH session for docker group)",
      );
    } else {
      return { mode: "direct", label: "docker" };
    }

    if (await this.remoteDockerPs(client, "sudo -n docker")) {
      return { mode: "sudo", label: "sudo docker" };
    }

    const sg = await this.executor.executeCommand(
      client,
      'command -v docker >/dev/null 2>&1 && sg docker -c "docker ps >/dev/null 2>&1" && echo ok',
    );
    if (sg.success) {
      logs.push(
        "Using sg docker for docker compose (docker group not active in this SSH session)",
      );
      return { mode: "sg", label: "sg docker" };
    }

    const diag = await this.executor.executeCommand(
      client,
      "command -v docker; sudo -n docker ps 2>&1; id; groups 2>&1",
    );
    this.appendCommandOutput(logs, diag);

    return null;
  }

  private async remoteDockerPs(
    client: Client,
    dockerInvocation: string,
  ): Promise<boolean> {
    const check = await this.executor.executeCommand(
      client,
      `command -v docker >/dev/null 2>&1 && ${dockerInvocation} ps >/dev/null 2>&1 && echo ok`,
    );
    return check.success;
  }

  private async detectComposeCommand(
    client: Client,
    dockerCli: { mode: "direct" | "sudo" | "sg"; label: string },
  ): Promise<string | null> {
    if (dockerCli.mode === "sg") {
      const probe = await this.executor.executeCommand(
        client,
        'sg docker -c "docker compose version >/dev/null 2>&1" && echo ok',
      );
      return probe.success ? "sg" : null;
    }

    const prefix = dockerCli.mode === "sudo" ? "sudo -n docker" : "docker";
    const probe = await this.executor.executeCommand(
      client,
      `command -v docker >/dev/null 2>&1 && ${prefix} compose version >/dev/null 2>&1 && echo ok`,
    );
    return probe.success ? dockerCli.mode : null;
  }

  private buildComposeCommand(
    remoteDir: string,
    composeMode: string,
    subcommand: string,
  ): string {
    const base = `-f ${AGENT_INSTALL.COMPOSE_FILE} --env-file ${AGENT_INSTALL.ENV_FILE} ${subcommand}`;
    switch (composeMode) {
      case "sg":
        return `cd ${remoteDir} && sg docker -c "docker compose ${base}"`;
      case "sudo":
        return `cd ${remoteDir} && sudo -n docker compose ${base}`;
      default:
        return `cd ${remoteDir} && docker compose ${base}`;
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
    result: { stderr: string; stdout: string; exitCode: number | null },
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
