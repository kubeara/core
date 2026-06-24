import { Injectable, Logger } from "@nestjs/common";
import { spawn } from "node:child_process";
import { ERROR_MESSAGES } from "@shared/common";
import type { PortFileInput } from "../executors/env-file.util";

export class PortUnavailableError extends Error {
  readonly port: number;

  constructor(port: number) {
    super(ERROR_MESSAGES.DEPLOYMENT_PORT_IN_USE(port));
    this.name = "PortUnavailableError";
    this.port = port;
  }
}

@Injectable()
export class PortAvailabilityService {
  private readonly logger = new Logger(PortAvailabilityService.name);

  /**
   * Verifies that each configured host port can be bound before deployment starts.
   * ports - Resolved SERVICE_PORT_* values from deployment environment variables.
   */
  async assertPortsAvailable(ports: PortFileInput): Promise<void> {
    const entries = Object.entries(ports).filter(
      (entry): entry is [string, number] => this.isValidHostPort(entry[1]),
    );

    if (entries.length === 0) {
      this.logger.log(
        "Port availability check skipped: no host ports configured",
      );
      return;
    }

    for (const [key, port] of entries) {
      await this.assertHostPortAvailable(port, key);
    }
  }

  async assertHostPortsAvailable(ports: number[]): Promise<void> {
    const uniquePorts = [
      ...new Set(ports.filter((port) => this.isValidHostPort(port))),
    ];

    if (uniquePorts.length === 0) {
      this.logger.log(
        "Port availability check skipped: no resolved host ports to validate",
      );
      return;
    }

    for (const port of uniquePorts) {
      await this.assertHostPortAvailable(port);
    }
  }

  private async assertHostPortAvailable(
    port: number,
    label?: string,
  ): Promise<void> {
    const available = await this.isHostPortAvailable(port);
    const portLabel = label ? `${label}=${port}` : String(port);

    if (available) {
      this.logger.log(
        `Port availability check passed for host port ${portLabel}`,
      );
      return;
    }

    this.logger.warn(
      `Port availability check failed for host port ${portLabel}: port is already in use on the host`,
    );
    throw new PortUnavailableError(port);
  }

  private isValidHostPort(port: number | null | undefined): port is number {
    return (
      typeof port === "number" &&
      Number.isFinite(port) &&
      Number.isInteger(port) &&
      port > 0 &&
      port <= 65535
    );
  }

  /**
   * Checks whether a TCP port is free on the Docker host (not inside the agent container).
   */
  private async isHostPortAvailable(port: number): Promise<boolean> {
    if (await this.isPortPublishedOnDockerHost(port)) {
      return false;
    }

    return this.canBindOnDockerHostNetwork(port);
  }

  private async isPortPublishedOnDockerHost(port: number): Promise<boolean> {
    const result = await this.execCapture("docker", [
      "ps",
      "--filter",
      `publish=${port}`,
      "-q",
    ]);

    if (result.exitCode !== 0) {
      this.logger.warn(
        `Docker publish filter check failed for port ${port}: ${result.stderr || result.stdout}`,
      );
      return false;
    }

    return result.stdout.trim().length > 0;
  }

  private async canBindOnDockerHostNetwork(port: number): Promise<boolean> {
    const image = this.resolveProbeImage();
    const bindScript = [
      "const net=require('net')",
      "const port=Number(process.argv[1])",
      "const server=net.createServer()",
      "server.once('error',()=>process.exit(1))",
      "server.once('listening',()=>server.close(()=>process.exit(0)))",
      "server.listen(port,'0.0.0.0')",
    ].join(";");

    const result = await this.execCapture("docker", [
      "run",
      "--rm",
      "--network",
      "host",
      "--entrypoint",
      "node",
      image,
      "-e",
      bindScript,
      String(port),
    ]);

    if (result.exitCode === 0) {
      return true;
    }

    if (result.exitCode === 1) {
      return false;
    }

    throw new Error(
      `Host-network bind probe failed for port ${port}: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`,
    );
  }

  private resolveProbeImage(): string {
    return (
      process.env.KUBEARA_AGENT_IMAGE?.trim() ||
      process.env.DOCKER_IMAGE?.trim() ||
      "kubeara/agent:prod"
    );
  }

  /**
   * Executes a command and captures the output.
   */
  private execCapture(
    cmd: string,
    args: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd: process.cwd() });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        resolve({ exitCode: 1, stdout, stderr: error.message });
      });
      child.on("close", (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
  }
}
