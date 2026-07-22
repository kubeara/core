import { Injectable, Logger } from "@nestjs/common";
import { SshConnectionManager } from "../managers/ssh-connection-manager.service";
import { ExecuteResult } from "../types/execute-result.interface";
import { Client } from "ssh2";
import { SSH_DEFAULTS } from "../constants/ssh.constants";
import { SshCommandError } from "../errors/ssh-command.error";
import {
  logStructured,
  logStructuredError,
  sanitizeSshCommand,
} from "@shared/common";

@Injectable()
export class SshCommandExecutorService {
  private readonly logger = new Logger(SshCommandExecutorService.name);

  constructor(private readonly manager: SshConnectionManager) {}

  async executeCommandStreaming(
    clientOrId: Client | string,
    command: string,
    options: {
      timeoutMs?: number;
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
    } = {},
  ): Promise<ExecuteResult> {
    const timeoutMs = options.timeoutMs ?? SSH_DEFAULTS.COMMAND_TIMEOUT;
    const start = Date.now();

    const execOnClient = (client: Client) =>
      new Promise<ExecuteResult>((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        let exitCode: number | null = null;

        const onError = (err: Error) => {
          logStructuredError(
            this.logger,
            "ssh.exec_stream",
            err,
            this.buildExecContext(clientOrId, command, Date.now() - start),
          );
          reject(new SshCommandError(err.message));
        };

        const timer = setTimeout(() => {
          reject(new SshCommandError("Command timed out"));
        }, timeoutMs);

        client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            return onError(err);
          }

          stream
            .on("close", (code: number) => {
              clearTimeout(timer);
              exitCode = code;
              resolve({
                success: code === 0,
                stdout,
                stderr,
                exitCode,
                executionTimeMs: Date.now() - start,
              });
            })
            .on("data", (data: Buffer) => {
              const chunk = data.toString("utf8");
              stdout += chunk;
              options.onStdout?.(chunk);
            })
            .stderr.on("data", (data: Buffer) => {
              const chunk = data.toString("utf8");
              stderr += chunk;
              options.onStderr?.(chunk);
            });
        });
      });

    let client: Client | null = null;
    if (typeof clientOrId === "string") {
      client = this.manager.getConnection(clientOrId);
      if (!client) {
        throw new SshCommandError("No active SSH connection for server");
      }
    } else {
      client = clientOrId;
    }

    try {
      return await execOnClient(client);
    } catch (err) {
      logStructuredError(
        this.logger,
        "ssh.exec_stream",
        err,
        this.buildExecContext(clientOrId, command, Date.now() - start),
      );
      throw err;
    }
  }

  private buildExecContext(
    clientOrId: Client | string,
    command: string,
    durationMs: number,
    result?: ExecuteResult,
  ) {
    return {
      module: "SshCommandExecutorService",
      serverId: typeof clientOrId === "string" ? clientOrId : undefined,
      command: sanitizeSshCommand(command),
      durationMs,
      exitCode: result?.exitCode,
      stdoutLen: result?.stdout.length,
      stderrLen: result?.stderr.length,
    };
  }

  async executeCommand(
    clientOrId: Client | string,
    command: string,
    timeoutMs = SSH_DEFAULTS.COMMAND_TIMEOUT,
  ): Promise<ExecuteResult> {
    const start = Date.now();

    const execOnClient = (client: Client) =>
      new Promise<ExecuteResult>((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        let exitCode: number | null = null;

        const onError = (err: Error) => {
          logStructuredError(
            this.logger,
            "ssh.exec",
            err,
            this.buildExecContext(clientOrId, command, Date.now() - start),
          );
          reject(new SshCommandError(err.message));
        };

        const timer = setTimeout(() => {
          reject(new SshCommandError("Command timed out"));
        }, timeoutMs);

        client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            return onError(err);
          }

          stream
            .on("close", (code: number) => {
              clearTimeout(timer);
              exitCode = code;
              resolve({
                success: code === 0,
                stdout,
                stderr,
                exitCode,
                executionTimeMs: Date.now() - start,
              });
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString("utf8");
            })
            .stderr.on("data", (data: Buffer) => {
              stderr += data.toString("utf8");
            });
        });
      });

    let client: Client | null = null;
    if (typeof clientOrId === "string") {
      client = this.manager.getConnection(clientOrId);
      if (!client)
        throw new SshCommandError("No active SSH connection for server");
    } else {
      client = clientOrId;
    }

    try {
      const res = await execOnClient(client);
      if (!res.success) {
        logStructured(this.logger, "warn", "ssh.exec", "failed", {
          ...this.buildExecContext(
            clientOrId,
            command,
            res.executionTimeMs,
            res,
          ),
          reason: res.stderr.trim() || `exit code ${res.exitCode ?? "unknown"}`,
        });
      } else {
        logStructured(this.logger, "debug", "ssh.exec", "succeeded", {
          ...this.buildExecContext(
            clientOrId,
            command,
            res.executionTimeMs,
            res,
          ),
        });
      }
      return res;
    } catch (err) {
      logStructuredError(
        this.logger,
        "ssh.exec",
        err,
        this.buildExecContext(clientOrId, command, Date.now() - start),
      );
      throw err;
    }
  }

  async executeCommands(
    clientOrId: Client | string,
    commands: string[],
    timeoutMs?: number,
  ) {
    const results = [] as ExecuteResult[];
    for (const cmd of commands) {
      // sequential execution
      // rethrow on failure to let caller decide
      const r = await this.executeCommand(clientOrId, cmd, timeoutMs);
      results.push(r);
    }
    return results;
  }
}
