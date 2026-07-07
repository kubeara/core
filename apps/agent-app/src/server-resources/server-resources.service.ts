import { Injectable, Logger } from "@nestjs/common";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import {
  buildServerResourcesMetrics,
  delayMs,
  parseCpuCoresFromCpuinfo,
  parseHostnameFromProc,
  scheduleTimeoutAction,
  withTimeout as raceWithTimeout,
} from "@shared/common";
import type { ServerGetResourcesResponsePayload } from "@shared/socket-events";

import {
  CPU_SAMPLE_INTERVAL_MS,
  DF_COMMAND_TIMEOUT_MS,
  SERVER_RESOURCES_TIMEOUT_MS,
} from "../common/constants/server-resources.constant";

/**
 * Collects on-demand Linux host metrics using `/proc` files and built-in OS APIs.
 */
@Injectable()
export class ServerResourcesService {
  private readonly logger = new Logger(ServerResourcesService.name);
  private readonly procPrefixPromise = this.resolveProcPrefix();

  /**
   * Gathers current server resource metrics for a socket request.
   * @param requestId Correlation id from the control panel.
   */
  async collectResources(
    requestId: string,
  ): Promise<ServerGetResourcesResponsePayload> {
    try {
      const resources = await this.getCurrentMetrics();
      this.logger.log(`Collected server resources for requestId=${requestId}`);
      return { requestId, resources };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Server resource collection failed: ${message}`);
      return { requestId, error: message };
    }
  }

  /**
   * Gathers current server resource metrics without socket correlation metadata.
   */
  async getCurrentMetrics() {
    try {
      return await this.withTimeout(
        this.gatherMetrics(),
        SERVER_RESOURCES_TIMEOUT_MS,
        "Server resource collection timed out",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Get current metrics failed: ${message}`);
      throw error;
    }
  }

  /**
   * Gathers current server resource metrics.
   * @returns Server resources metrics
   */
  private async gatherMetrics() {
    try {
      const procPrefix = await this.procPrefixPromise;
      const hostRoot = await this.resolveHostRootPath(procPrefix);

      const cpuStatFirstLine = this.extractCpuLine(
        await this.readProcFile(procPrefix, "stat"),
      );
      await this.sleep(CPU_SAMPLE_INTERVAL_MS);
      const cpuStatSecondLine = this.extractCpuLine(
        await this.readProcFile(procPrefix, "stat"),
      );

      const [
        meminfo,
        dfStdout,
        netDev,
        uptimeContent,
        loadAverageContent,
        cpuinfo,
        hostnameContent,
      ] = await Promise.all([
        this.readProcFile(procPrefix, "meminfo"),
        this.collectDfStdout(hostRoot),
        this.readProcFile(procPrefix, "net/dev"),
        this.readProcFile(procPrefix, "uptime"),
        this.readProcFile(procPrefix, "loadavg"),
        this.readProcFile(procPrefix, "cpuinfo"),
        this.readProcFile(procPrefix, "sys/kernel/hostname"),
      ]);

      const cpuCores = parseCpuCoresFromCpuinfo(cpuinfo) || os.cpus().length;
      const hostname = parseHostnameFromProc(hostnameContent) || os.hostname();

      return buildServerResourcesMetrics({
        cpuStatFirstLine,
        cpuStatSecondLine,
        loadAverageContent,
        cpuCores,
        meminfo,
        dfStdout,
        netDev,
        uptimeContent,
        hostname,
        platform: os.platform(),
        architecture: os.arch(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Get current metrics failed: ${message}`);
      throw error;
    }
  }

  /**
   * Resolves the prefix for the `/proc` directory.
   * @returns Proc prefix
   */
  private async resolveProcPrefix(): Promise<string> {
    const configured = process.env.KUBEARA_HOST_PROC_PREFIX?.trim();
    if (configured) {
      return configured.replace(/\/+$/, "");
    }

    const hostProc = "/host/proc";
    try {
      await access(path.join(hostProc, "stat"));
      this.logger.log(`Using host proc mount at ${hostProc}`);
      return hostProc;
    } catch {
      return "/proc";
    }
  }

  /**
   * Resolves the host root path used for `df` (container `/` when no host mount).
   */
  private async resolveHostRootPath(procPrefix: string): Promise<string> {
    const configured = process.env.KUBEARA_HOST_ROOT_PREFIX?.trim();
    if (configured) {
      return configured.replace(/\/+$/, "") || "/";
    }

    const hostRoot = "/host/root";
    try {
      await access(hostRoot);
      this.logger.log(`Using host root mount at ${hostRoot}`);
      return hostRoot;
    } catch {
      if (procPrefix !== "/proc") {
        this.logger.warn(
          "Host /proc is mounted but host root is not; disk metrics reflect the agent container filesystem",
        );
      }
      return "/";
    }
  }

  /**
   * Reads a file from the `/proc` directory.
   */
  private async readProcFile(
    prefix: string,
    relativePath: string,
  ): Promise<string> {
    try {
      return await readFile(path.join(prefix, relativePath), "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to read proc file ${relativePath}: ${message}`);
      throw error;
    }
  }

  /**
   * Extracts the CPU line from the content.
   */
  private extractCpuLine(content: string): string {
    try {
      const cpuLine = content
        .split("\n")
        .find((line) => line.startsWith("cpu "));
      if (!cpuLine) {
        throw new Error("Failed to read CPU stats from /proc/stat");
      }
      return cpuLine;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to extract CPU line: ${message}`);
      throw error;
    }
  }

  /**
   * Collects the output of the `df` command.
   */
  private async collectDfStdout(targetPath: string): Promise<string> {
    const result = await this.execCapture(
      "df",
      ["-B1", targetPath],
      DF_COMMAND_TIMEOUT_MS,
    );

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() ||
          result.stdout.trim() ||
          `df exited with code ${result.exitCode}`,
      );
    }

    return result.stdout;
  }

  /**
   * Executes a command and captures the output.
   */
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

      let cancelTimeout: () => void = () => {};

      const finish = (exitCode: number) => {
        if (settled) {
          return;
        }
        settled = true;
        cancelTimeout();
        resolve({ exitCode, stdout, stderr });
      };

      cancelTimeout = scheduleTimeoutAction(timeoutMs, () => {
        stderr += `\nCommand timed out after ${timeoutMs}ms`;
        child.kill("SIGKILL");
        finish(124);
      });

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

  /**
   * Wraps a promise with a timeout.
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    return raceWithTimeout(promise, timeoutMs, message);
  }

  private sleep(ms: number): Promise<void> {
    return delayMs(ms);
  }
}
