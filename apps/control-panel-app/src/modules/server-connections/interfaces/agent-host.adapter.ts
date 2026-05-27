import { ExecuteResult } from "@shared/ssh";

/**
 * Host abstraction for agent provisioning (local shell or remote SSH).
 */
export interface AgentHostAdapter {
  readonly label: string;
  executeCommand(command: string, timeoutMs?: number): Promise<ExecuteResult>;
  writeTextFile(
    filePath: string,
    content: string,
  ): Promise<{ ok: boolean; error?: string }>;
  disconnect?(): void;
}
