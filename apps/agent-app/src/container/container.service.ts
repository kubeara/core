import { Injectable, Logger } from "@nestjs/common";
import { spawn } from "child_process";
import {
  logStructured,
  logStructuredError,
  parseDockerPsStdout,
} from "@shared/common";
import type {
  ContainerActionResponsePayload,
  ContainerActionType,
  ContainerDiscoverResponsePayload,
} from "@shared/socket-events";

import {
  buildDockerActionArgs,
  CONTAINER_ACTION_TIMEOUT_MS,
  CONTAINER_LOGS_COMMAND,
  DOCKER_PS_COMMAND,
  DOCKER_PS_TIMEOUT_MS,
} from "../common/constants/container.constant";
import {
  buildContainerDeletePlan,
  CONTAINER_DELETE_INSPECT,
  formatCleanupLine,
  isContainerAlreadyStopped,
  readDockerCommandDetail,
  type ContainerDeleteCleanupResult,
  type DockerExecResult,
} from "./utils/container-delete.util";
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
    try {
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
      logStructured(this.logger, "log", "container.logs", "started", {
        module: "ContainerService",
        sessionId,
        command: args.join(" "),
      });

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
        logStructuredError(this.logger, "container.logs.start", err, {
          module: "ContainerService",
          sessionId,
        });
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
            activeSession.stderr.trim() ||
            `docker logs exited with code ${code}`;
          this.errorHandler?.(sessionId, this.classifyDockerError(detail));
        }

        this.closeHandler?.(sessionId);
        logStructured(this.logger, "log", "container.logs", "succeeded", {
          module: "ContainerService",
          sessionId,
          exitCode: code ?? null,
          stopping: activeSession.stopping,
        });
      });

      this.logSessions.set(sessionId, session);

      return null;
    } catch (error) {
      logStructuredError(this.logger, "container.logs.start", error, {
        module: "ContainerService",
        sessionId,
      });
      throw error;
    }
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
      logStructured(this.logger, "warn", "container.logs.stop", "failed", {
        module: "ContainerService",
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logStructured(this.logger, "log", "container.logs", "started", {
      module: "ContainerService",
      sessionId,
      action: "stop",
    });
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
      logStructured(this.logger, "log", "container.action", "started", {
        module: "ContainerService",
        requestId,
        command: args.join(" "),
      });
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
   * Stops and removes the container plus its image, mounted volumes, and
   * attached user-defined networks. Individual cleanup steps are best-effort
   * after the container itself has been removed.
   */
  private async executeDelete(
    requestId: string,
    containerId: string,
  ): Promise<ContainerActionResponsePayload> {
    try {
      logStructured(this.logger, "log", "container.action", "started", {
        module: "ContainerService",
        requestId,
        containerId,
        action: "delete_with_cleanup",
      });

      const planResult = await this.collectContainerDeletePlan(
        requestId,
        containerId,
      );
      if (!planResult.ok) {
        return planResult.response;
      }

      const stopResult = await this.execCapture(
        "docker",
        ["stop", containerId],
        CONTAINER_ACTION_TIMEOUT_MS,
      );
      if (
        stopResult.exitCode !== 0 &&
        !isContainerAlreadyStopped(readDockerCommandDetail(stopResult))
      ) {
        return this.buildResponse(
          requestId,
          containerId,
          "delete",
          stopResult,
          "docker stop",
        );
      }

      const rmResult = await this.execCapture(
        "docker",
        ["rm", "-f", "-v", containerId],
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

      const cleanup = await this.cleanupDeletedContainerResources(
        planResult.plan,
      );

      const logLines = ["Container stopped and removed", ...cleanup.logLines];
      this.logger.log(
        `Container delete succeeded containerId=${containerId} requestId=${requestId}: ${logLines.join("; ")}`,
      );

      return {
        requestId,
        containerId,
        action: "delete",
        success: true,
        stdout:
          `${logLines.join("\n")}\n${stopResult.stdout}${rmResult.stdout}${cleanup.stdout}`.trim(),
        stderr:
          `${stopResult.stderr}${rmResult.stderr}${cleanup.stderr}`.trim(),
        exitCode: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStructuredError(this.logger, "container.delete", error, {
        module: "ContainerService",
        requestId,
        containerId,
      });
      return this.failure(requestId, containerId, "delete", message);
    }
  }

  /**
   * Inspects the container before deletion and returns the resources that
   * should be cleaned up afterward.
   */
  private async collectContainerDeletePlan(
    requestId: string,
    containerId: string,
  ): Promise<
    | { ok: true; plan: ReturnType<typeof buildContainerDeletePlan> }
    | { ok: false; response: ContainerActionResponsePayload }
  > {
    const imageInspect = await this.dockerInspect(
      containerId,
      CONTAINER_DELETE_INSPECT.image,
    );
    if (imageInspect.exitCode !== 0) {
      return {
        ok: false,
        response: this.buildInspectFailure(
          requestId,
          containerId,
          imageInspect,
          "docker inspect (image)",
        ),
      };
    }

    const mountsInspect = await this.dockerInspect(
      containerId,
      CONTAINER_DELETE_INSPECT.mounts,
    );
    if (mountsInspect.exitCode !== 0) {
      return {
        ok: false,
        response: this.buildInspectFailure(
          requestId,
          containerId,
          mountsInspect,
          "docker inspect (mounts)",
        ),
      };
    }

    const networksInspect = await this.dockerInspect(
      containerId,
      CONTAINER_DELETE_INSPECT.networks,
    );
    if (networksInspect.exitCode !== 0) {
      return {
        ok: false,
        response: this.buildInspectFailure(
          requestId,
          containerId,
          networksInspect,
          "docker inspect (networks)",
        ),
      };
    }

    return {
      ok: true,
      plan: buildContainerDeletePlan({
        imageInspectStdout: imageInspect.stdout,
        mountsInspectStdout: mountsInspect.stdout,
        networksInspectStdout: networksInspect.stdout,
      }),
    };
  }

  /**
   * Removes the container image, volumes, and networks after the container has
   * already been deleted. Failures are logged but do not fail the action.
   */
  private async cleanupDeletedContainerResources(plan: {
    imageId: string;
    volumeNames: string[];
    networkNames: string[];
  }): Promise<ContainerDeleteCleanupResult> {
    const logLines: string[] = [];
    let stdout = "";
    let stderr = "";

    if (plan.imageId) {
      const rmiResult = await this.execCapture(
        "docker",
        ["rmi", "-f", plan.imageId],
        CONTAINER_ACTION_TIMEOUT_MS,
      );
      stdout += rmiResult.stdout;
      stderr += rmiResult.stderr;
      logLines.push(
        formatCleanupLine(
          "Image",
          null,
          rmiResult.exitCode === 0,
          readDockerCommandDetail(rmiResult),
        ),
      );
    }

    for (const volumeName of plan.volumeNames) {
      const volumeResult = await this.execCapture(
        "docker",
        ["volume", "rm", "-f", volumeName],
        CONTAINER_ACTION_TIMEOUT_MS,
      );
      stdout += volumeResult.stdout;
      stderr += volumeResult.stderr;
      logLines.push(
        formatCleanupLine(
          "Volume",
          volumeName,
          volumeResult.exitCode === 0,
          readDockerCommandDetail(volumeResult),
        ),
      );
    }

    for (const networkName of plan.networkNames) {
      const networkResult = await this.execCapture(
        "docker",
        ["network", "rm", networkName],
        CONTAINER_ACTION_TIMEOUT_MS,
      );
      stdout += networkResult.stdout;
      stderr += networkResult.stderr;
      logLines.push(
        formatCleanupLine(
          "Network",
          networkName,
          networkResult.exitCode === 0,
          readDockerCommandDetail(networkResult),
        ),
      );
    }

    return { logLines, stdout, stderr };
  }

  /**
   * Runs `docker inspect -f <format>` for a container.
   */
  private async dockerInspect(
    containerId: string,
    format: string,
  ): Promise<DockerExecResult> {
    return this.execCapture(
      "docker",
      ["inspect", "-f", format, containerId],
      CONTAINER_ACTION_TIMEOUT_MS,
    );
  }

  /**
   * Builds a failed delete response when pre-delete inspect commands fail.
   */
  private buildInspectFailure(
    requestId: string,
    containerId: string,
    result: DockerExecResult,
    commandLabel: string,
  ): ContainerActionResponsePayload {
    return this.buildResponse(
      requestId,
      containerId,
      "delete",
      result,
      commandLabel,
    );
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
        finish(1);
      });
      child.on("close", (code) => {
        finish(code ?? 1);
      });
    });
  }
}
