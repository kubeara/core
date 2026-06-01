import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn } from "child_process";
import { existsSync } from "fs";
import * as path from "path";

@Injectable()
export class TraefikProxyService {
  private readonly logger = new Logger(TraefikProxyService.name);
  private readonly projectName = "kubeara-proxy";

  /**
   * Initializes proxy service with configuration access.
   * @param configService Nest config service for env lookups.
   */
  constructor(private readonly configService: ConfigService) {}

  /**
   * Returns whether Traefik integration is enabled.
   * @returns True when Traefik should be used for routing.
   */
  isEnabled(): boolean {
    try {
      return (
        this.configService.get<string>("TRAEFIK_ENABLED", "false") === "true"
      );
    } catch (error) {
      throw new Error(
        `Failed to evaluate TRAEFIK_ENABLED flag: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns whether HTTPS routers should be configured.
   * @returns True when HTTPS mode is enabled.
   */
  isHttpsEnabled(): boolean {
    try {
      return (
        this.configService.get<string>("TRAEFIK_HTTPS", "false") === "true"
      );
    } catch (error) {
      throw new Error(
        `Failed to evaluate TRAEFIK_HTTPS flag: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns whether HTTP-to-HTTPS redirect should be enforced.
   * @returns True when force-https redirect is enabled.
   */
  isForceHttps(): boolean {
    try {
      return (
        this.configService.get<string>("TRAEFIK_FORCE_HTTPS", "false") ===
        "true"
      );
    } catch (error) {
      throw new Error(
        `Failed to evaluate TRAEFIK_FORCE_HTTPS flag: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns the on-disk compose path for the shared Traefik proxy stack.
   * @returns Absolute compose path.
   */
  getProxyComposePath(): string {
    try {
      const configured = this.configService
        .get<string>("TRAEFIK_COMPOSE_PATH")
        ?.trim();
      if (configured) {
        return path.resolve(configured);
      }

      const candidates = [
        "/app/proxy/docker-compose.yml",
        path.join(process.cwd(), "apps/agent-app/proxy/docker-compose.yml"),
        path.join(__dirname, "..", "proxy", "docker-compose.yml"),
      ];

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          return candidate;
        }
      }

      return candidates[0];
    } catch (error) {
      throw new Error(
        `Failed to resolve Traefik compose path: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensures the Traefik proxy stack is running for route-based deployments.
   * @returns Promise resolved after successful proxy start.
   */
  async ensureRunning(): Promise<void> {
    try {
      const composePath = this.getProxyComposePath();
      const dockerArguments = [
        "compose",
        "-f",
        composePath,
        "-p",
        this.projectName,
        "up",
        "-d",
      ];

      const executionResult = await this.exec(
        "docker",
        dockerArguments,
        process.cwd(),
      );

      if (executionResult.exitCode !== 0) {
        throw new Error(
          `Failed to start Traefik proxy: ${executionResult.stderr || executionResult.stdout || executionResult.exitCode}`,
        );
      }

      this.logger.log(
        "Traefik proxy (kubeara-proxy) is running on ports 80/443",
      );
    } catch (error) {
      throw new Error(
        `Failed to ensure Traefik proxy is running: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Executes a child process command and collects stdout/stderr.
   * @param command Binary to execute.
   * @param args Arguments passed to command.
   * @param cwd Working directory for command execution.
   * @returns Process exit code and captured output.
   */
  private exec(
    command: string,
    args: string[],
    cwd: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    try {
      return new Promise((resolve) => {
        const childProcess = spawn(command, args, { cwd, env: process.env });
        let standardOutput = "";
        let standardError = "";

        childProcess.stdout.on("data", (chunk: Buffer) => {
          standardOutput += chunk.toString();
        });
        childProcess.stderr.on("data", (chunk: Buffer) => {
          standardError += chunk.toString();
        });
        childProcess.on("close", (code) => {
          resolve({
            exitCode: code ?? 1,
            stdout: standardOutput,
            stderr: standardError,
          });
        });
      });
    } catch (error) {
      return Promise.reject(
        new Error(
          `Failed to execute command "${command}": ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
}
