import { Injectable, Logger } from "@nestjs/common";
import { spawn } from "child_process";
import { parseDockerPsStdout } from "@shared/common";
import type {
  ContainerActionResponsePayload,
  ContainerActionType,
  ContainerDiscoverResponsePayload,
} from "@shared/socket-events";

import {
  BUILTIN_DOCKER_NETWORKS,
  buildDockerActionArgs,
  CONTAINER_ACTION_TIMEOUT_MS,
  CONTAINER_LOGS_COMMAND,
  DOCKER_NAME_PATTERN,
  DOCKER_PS_COMMAND,
  DOCKER_PS_TIMEOUT_MS,
} from "../common/constants/container.constant";
import type { ContainerLogSession } from "./interfaces/container-log-session.interface";
import type {
  ContainerLogsCloseHandler,
  ContainerLogsDataHandler,
  ContainerLogsErrorHandler,
} from "./types/container-logs-handler.types";

@Injectable()
export class ContainerService {
  private readonly logger = new Logger(ContainerService.name);
  private readonly logSessions = new Map<string, ContainerLogSession>();
  private dataHandler: ContainerLogsDataHandler | null = null;
  private errorHandler: ContainerLogsErrorHandler | null = null;
  private closeHandler: ContainerLogsCloseHandler | null = null;

  setLogsDataHandler(handler: ContainerLogsDataHandler): void {
    this.dataHandler = handler;
  }

  setLogsErrorHandler(handler: ContainerLogsErrorHandler): void {
    this.errorHandler = handler;
  }

  setLogsCloseHandler(handler: ContainerLogsCloseHandler): void {
    this.closeHandler = handler;
  }

  /**
   * Starts streaming docker logs for a container.
   */
  async startLogStream(
    sessionId: string,
    containerId: string,
  ): Promise<string | null> {
    const trimmedId = containerId.trim();
    if (!trimmedId) {
      return "Missing containerId";
    }

    if (this.logSessions.has(sessionId)) {
      this.stopLogStream(sessionId);
    }

    const inspectResult = await this.execCapture(
      "docker",
      ["inspect", "-f", "{{.Id}}", trimmedId],
      CONTAINER_ACTION_TIMEOUT_MS,
    );

    if (inspectResult.exitCode !== 0) {
      const inspectDetail =
        inspectResult.stderr.trim() ||
        inspectResult.stdout.trim() ||
        `Container '${trimmedId}' not found`;
      return this.classifyDockerError(inspectDetail);
    }

    const resolvedId =
      inspectResult.stdout.trim().replace(/^sha256:/, "") || trimmedId;
    const logsTarget =
      resolvedId.length >= 12 ? resolvedId.slice(0, 12) : trimmedId;

    const args = CONTAINER_LOGS_COMMAND(logsTarget);
    this.logger.log(
      `[CONTAINER_LOGS] starting docker ${args.join(" ")} sessionId=${sessionId}`,
    );

    const child = spawn("docker", args, { cwd: process.cwd() });
    const session: ContainerLogSession = {
      sessionId,
      containerId: resolvedId,
      child,
      stopping: false,
      stderr: "",
    };

    child.on("error", (err) => {
      const message = this.classifyDockerError(err.message);
      this.logger.error(
        `[CONTAINER_LOGS] failed to start docker logs sessionId=${sessionId}: ${message}`,
      );
      this.cleanupLogSession(sessionId, message);
    });

    child.stdout.on("data", (chunk: Buffer | string) => {
      this.dataHandler?.(sessionId, String(chunk));
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      session.stderr += text;
      this.dataHandler?.(sessionId, text);
    });

    child.on("close", (code) => {
      const activeSession = this.logSessions.get(sessionId);
      if (!activeSession) {
        return;
      }

      this.logSessions.delete(sessionId);

      if (!activeSession.stopping && code !== 0 && code !== null) {
        const detail =
          activeSession.stderr.trim() || `docker logs exited with code ${code}`;
        this.errorHandler?.(sessionId, this.classifyDockerError(detail));
      }

      this.closeHandler?.(sessionId);
      this.logger.log(
        `[CONTAINER_LOGS] stream closed sessionId=${sessionId} exitCode=${code ?? "null"} stopping=${activeSession.stopping}`,
      );
    });

    this.logSessions.set(sessionId, session);

    return null;
  }

  /**
   * Stops an active container log stream.
   */
  stopLogStream(sessionId: string): void {
    const session = this.logSessions.get(sessionId);
    if (!session) {
      return;
    }

    session.stopping = true;
    try {
      session.child.kill("SIGTERM");
    } catch (error) {
      this.logger.warn(
        `[CONTAINER_LOGS] failed to kill log process sessionId=${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.logger.log(`[CONTAINER_LOGS] stopping stream sessionId=${sessionId}`);
  }

  /**
   * Checks if a log session exists.
   */
  hasLogSession(sessionId: string): boolean {
    return this.logSessions.has(sessionId);
  }

  /**
   * Cleans up a log session and triggers error and close handlers.
   */
  private cleanupLogSession(sessionId: string, error: string): void {
    this.logSessions.delete(sessionId);
    this.errorHandler?.(sessionId, error);
    this.closeHandler?.(sessionId);
  }

  /**
   * Classifies a Docker error message.
   */
  private classifyDockerError(raw: string): string {
    const normalized = raw.toLowerCase();

    if (
      normalized.includes("no such container") ||
      normalized.includes("could not find container")
    ) {
      return "Container not found";
    }

    if (
      normalized.includes("cannot connect to the docker daemon") ||
      normalized.includes("docker daemon is not running") ||
      normalized.includes("is the docker daemon running")
    ) {
      return "Docker is unavailable on this server";
    }

    if (normalized.includes("permission denied")) {
      return "Permission denied when accessing Docker";
    }

    if (normalized.includes("exited with code 125")) {
      return "Log streaming failed. The container may be unavailable or Docker rejected the request.";
    }

    const trimmed = raw.trim();
    if (trimmed.toLowerCase().startsWith("error response from daemon:")) {
      return (
        trimmed.replace(/^error response from daemon:\s*/i, "").trim() ||
        "Log streaming failed"
      );
    }

    return trimmed || "Log streaming failed";
  }

  /**
   * Discovers containers on the host machine.
   */
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

  /**
   * Executes a container action on the host machine.
   */
  async executeAction(
    requestId: string,
    containerId: string,
    action: ContainerActionType,
  ): Promise<ContainerActionResponsePayload> {
    const trimmedId = containerId.trim();
    if (!trimmedId) {
      return this.failure(requestId, trimmedId, action, "Missing containerId");
    }

    try {
      if (action === "delete") {
        return await this.executeDelete(requestId, trimmedId);
      }

      const args = buildDockerActionArgs(action, trimmedId);
      this.logger.log(
        `[CONTAINER_ACTION] executing docker ${args.join(" ")} requestId=${requestId}`,
      );
      const result = await this.execCapture(
        "docker",
        args,
        CONTAINER_ACTION_TIMEOUT_MS,
      );

      return this.buildResponse(
        requestId,
        trimmedId,
        action,
        result,
        `docker ${action}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Container ${action} handler failed containerId=${trimmedId} requestId=${requestId}: ${message}`,
      );
      return this.failure(requestId, trimmedId, action, message);
    }
  }

  /**
   * Runs the docker ps command and returns the stdout.
   */
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

  /**
   * Executes the delete container action on the host machine.
   */
  private async executeDelete(
    requestId: string,
    containerId: string,
  ): Promise<ContainerActionResponsePayload> {
    this.logger.log(
      `[CONTAINER_ACTION] deleting container with image/network cleanup containerId=${containerId} requestId=${requestId}`,
    );

    const imageInspect = await this.execCapture(
      "docker",
      ["inspect", "-f", "{{.Image}}", containerId],
      CONTAINER_ACTION_TIMEOUT_MS,
    );
    if (imageInspect.exitCode !== 0) {
      return this.buildResponse(
        requestId,
        containerId,
        "delete",
        imageInspect,
        "docker inspect (image)",
      );
    }

    const networksInspect = await this.execCapture(
      "docker",
      [
        "inspect",
        "-f",
        "{{range $k,$v := .NetworkSettings.Networks}}{{$k}}\n{{end}}",
        containerId,
      ],
      CONTAINER_ACTION_TIMEOUT_MS,
    );
    if (networksInspect.exitCode !== 0) {
      return this.buildResponse(
        requestId,
        containerId,
        "delete",
        networksInspect,
        "docker inspect (networks)",
      );
    }

    const imageId = imageInspect.stdout.trim();
    const networks = this.parseNetworkNames(networksInspect.stdout);

    const rmResult = await this.execCapture(
      "docker",
      ["rm", "-f", containerId],
      CONTAINER_ACTION_TIMEOUT_MS,
    );
    if (rmResult.exitCode !== 0) {
      return this.buildResponse(
        requestId,
        containerId,
        "delete",
        rmResult,
        "docker rm",
      );
    }

    const logLines = ["Container removed"];
    let combinedStdout = rmResult.stdout;
    let combinedStderr = rmResult.stderr;

    if (imageId) {
      const rmiResult = await this.execCapture(
        "docker",
        ["rmi", imageId],
        CONTAINER_ACTION_TIMEOUT_MS,
      );
      combinedStdout += rmiResult.stdout;
      combinedStderr += rmiResult.stderr;
      logLines.push(
        rmiResult.exitCode === 0
          ? "Image removed"
          : `Image kept (may be in use elsewhere): ${rmiResult.stderr.trim() || rmiResult.stdout.trim()}`,
      );
    }

    for (const network of networks) {
      const networkRm = await this.execCapture(
        "docker",
        ["network", "rm", network],
        CONTAINER_ACTION_TIMEOUT_MS,
      );
      combinedStdout += networkRm.stdout;
      combinedStderr += networkRm.stderr;
      logLines.push(
        networkRm.exitCode === 0
          ? `Network '${network}' removed`
          : `Network '${network}' kept (may be in use elsewhere)`,
      );
    }

    this.logger.log(
      `Container delete succeeded containerId=${containerId} requestId=${requestId}: ${logLines.join("; ")}`,
    );

    return {
      requestId,
      containerId,
      action: "delete",
      success: true,
      stdout: `${logLines.join("\n")}\n${combinedStdout}`.trim(),
      stderr: combinedStderr.trim(),
      exitCode: 0,
    };
  }

  private parseNetworkNames(raw: string): string[] {
    const names = new Set<string>();
    for (const line of raw.split(/\r?\n/)) {
      const name = line.trim();
      if (!name || BUILTIN_DOCKER_NETWORKS.has(name)) {
        continue;
      }
      if (!DOCKER_NAME_PATTERN.test(name)) {
        this.logger.warn(`Skipping unsafe network name from inspect: ${name}`);
        continue;
      }
      names.add(name);
    }
    return [...names];
  }

  /**
   * Builds the container action response payload.
   */
  private buildResponse(
    requestId: string,
    containerId: string,
    action: ContainerActionType,
    result: { exitCode: number; stdout: string; stderr: string },
    commandLabel: string,
  ): ContainerActionResponsePayload {
    const success = result.exitCode === 0;
    const detail =
      result.stderr.trim() ||
      result.stdout.trim() ||
      `${commandLabel} exited with code ${result.exitCode}`;

    if (success) {
      this.logger.log(
        `Container ${action} succeeded containerId=${containerId} requestId=${requestId}`,
      );
    } else {
      this.logger.warn(
        `Container ${action} failed containerId=${containerId} requestId=${requestId}: ${detail}`,
      );
    }

    return {
      requestId,
      containerId,
      action,
      success,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      error: success ? undefined : detail,
    };
  }

  private failure(
    requestId: string,
    containerId: string,
    action: ContainerActionType,
    error: string,
  ): ContainerActionResponsePayload {
    return {
      requestId,
      containerId,
      action,
      success: false,
      stdout: "",
      stderr: "",
      exitCode: 1,
      error,
    };
  }

  /**
   * Executes a command and returns the exit code, stdout, and stderr.
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
