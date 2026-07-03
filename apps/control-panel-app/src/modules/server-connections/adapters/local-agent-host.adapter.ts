import { exec } from "node:child_process";
import { promisify } from "node:util";

import { EXEC_DEFAULTS, SHELL_PATHS } from "@shared/common";
import { ExecuteResult } from "@shared/ssh";

import { AgentHostAdapter } from "../interfaces/agent-host.adapter";
import { writeLocalTextFile } from "../utils/local-file.util";

const execAsync = promisify(exec);

export class LocalAgentHostAdapter implements AgentHostAdapter {
  readonly label = "local";

  async executeCommand(
    command: string,
    timeoutMs?: number,
  ): Promise<ExecuteResult> {
    const start = Date.now();
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: timeoutMs,
        maxBuffer: EXEC_DEFAULTS.MAX_BUFFER_BYTES,
        shell: SHELL_PATHS.BASH,
        env: process.env,
      });
      return {
        success: true,
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        exitCode: 0,
        executionTimeMs: Date.now() - start,
      };
    } catch (err) {
      const error = err as {
        stdout?: string;
        stderr?: string;
        code?: number;
        killed?: boolean;
        signal?: string;
      };
      const message =
        error.killed && error.signal
          ? `Command timed out (${timeoutMs ?? "?"}ms)`
          : err instanceof Error
            ? err.message
            : String(err);

      return {
        success: false,
        stdout: error.stdout ?? "",
        stderr: [error.stderr, message].filter(Boolean).join("\n"),
        exitCode: typeof error.code === "number" ? error.code : 1,
        executionTimeMs: Date.now() - start,
      };
    }
  }

  async writeTextFile(
    filePath: string,
    content: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await writeLocalTextFile(filePath, content);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
