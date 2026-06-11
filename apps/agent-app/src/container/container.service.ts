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
  DOCKER_PS_COMMAND,
  DOCKER_PS_TIMEOUT_MS,
} from "../common/constants/container.constant";

const DOCKER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

@Injectable()
export class ContainerService {
  private readonly logger = new Logger(ContainerService.name);

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
