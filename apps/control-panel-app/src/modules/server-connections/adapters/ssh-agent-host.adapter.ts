import { Client } from "ssh2";

import { SshCommandExecutorService } from "@shared/ssh";

import { AgentHostAdapter } from "../interfaces/agent-host.adapter";
import { buildBase64WriteCommand } from "../utils/remote-file.util";

export class SshAgentHostAdapter implements AgentHostAdapter {
  readonly label = "ssh";

  constructor(
    private readonly client: Client,
    private readonly executor: SshCommandExecutorService,
  ) {}

  executeCommand(command: string, timeoutMs?: number) {
    return this.executor.executeCommand(this.client, command, timeoutMs);
  }

  async writeTextFile(
    filePath: string,
    content: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const result = await this.executor.executeCommand(
      this.client,
      buildBase64WriteCommand(filePath, content),
    );
    if (!result.success) {
      const detail = [result.stderr, result.stdout]
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n");
      return { ok: false, error: detail || `Failed to write ${filePath}` };
    }
    return { ok: true };
  }
}
