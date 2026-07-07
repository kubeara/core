import { Injectable, Logger } from "@nestjs/common";
import { createTimeoutRejection } from "@shared/common";
import { SshConnectionManager } from "../managers/ssh-connection-manager.service";
import { ExecuteResult } from "../types/execute-result.interface";
import { Client } from "ssh2";
import { SSH_DEFAULTS } from "../constants/ssh.constants";
import { SshCommandError } from "../errors/ssh-command.error";

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
          this.logger.warn(`SSH exec error: ${err.message}`);
          reject(new SshCommandError(err.message));
        };

        const timeout = createTimeoutRejection(
          timeoutMs,
          "Command timed out",
        );
        void timeout.promise.catch((error: unknown) => {
          reject(
            new SshCommandError(
              error instanceof Error ? error.message : "Command timed out",
            ),
          );
        });

        client.exec(command, (err, stream) => {
          if (err) {
            timeout.cancel();
            return onError(err);
          }

          stream
            .on("close", (code: number) => {
              timeout.cancel();
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
      this.logger.warn(`Command execution failed: ${(err as Error).message}`);
      throw err;
    }
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
          this.logger.warn(`SSH exec error: ${err.message}`);
          reject(new SshCommandError(err.message));
        };

        const timeout = createTimeoutRejection(
          timeoutMs,
          "Command timed out",
        );
        void timeout.promise.catch((error: unknown) => {
          reject(
            new SshCommandError(
              error instanceof Error ? error.message : "Command timed out",
            ),
          );
        });

        client.exec(command, (err, stream) => {
          if (err) {
            timeout.cancel();
            return onError(err);
          }

          stream
            .on("close", (code: number) => {
              timeout.cancel();
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
      this.logger.log(
        `Executed command on ssh; len_stdout=${res.stdout.length}`,
      );
      return res;
    } catch (err) {
      this.logger.warn(`Command execution failed: ${(err as Error).message}`);
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
