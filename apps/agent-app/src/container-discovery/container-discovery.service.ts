import { Injectable, Logger } from "@nestjs/common";
import { spawn } from "child_process";
import { parseDockerPsStdout } from "@shared/common";
import type { ContainerDiscoverResponsePayload } from "@shared/socket-events";

const DOCKER_PS_TIMEOUT_MS = 8_000;
const DOCKER_PS_COMMAND = ["ps", "-a", "--format", "{{json .}}"];

@Injectable()
export class ContainerDiscoveryService {
  private readonly logger = new Logger(ContainerDiscoveryService.name);

  async discoverContainers(
    requestId: string,
  ): Promise<ContainerDiscoverResponsePayload> {
    try {
      const stdout = await this.runDockerPs();
      const containers = parseDockerPsStdout(stdout);
      this.logger.log(
        `Discovered ${containers.length} container(s) for requestId=${requestId}`,
      );
      return { requestId, containers };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Container discovery failed: ${message}`);
      return { requestId, containers: [], error: message };
    }
  }

  private async runDockerPs(): Promise<string> {
    const result = await this.execCapture(
      "docker",
      DOCKER_PS_COMMAND,
      DOCKER_PS_TIMEOUT_MS,
    );

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() ||
          result.stdout.trim() ||
          `docker ps exited with code ${result.exitCode}`,
      );
    }

    return result.stdout;
  }

  private execCapture(
    cmd: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd: process.cwd() });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (exitCode: number) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode, stdout, stderr });
      };

      const timer = setTimeout(() => {
        stderr += `\nCommand timed out after ${timeoutMs}ms`;
        child.kill("SIGKILL");
        finish(124);
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (err) => {
        stderr += `Failed to start process: ${err.message}`;
      });
      child.on("close", (code) => {
        finish(code ?? 1);
      });
    });
  }
}
