import { SshConnectionOptions } from "@shared/ssh";

export interface RemoteAgentInstallInput {
  connection: SshConnectionOptions;
  serverHost: string;
  plainPrivateKey?: string;
}

export interface AgentInstallResult {
  success: boolean;
  logs: string[];
  error?: string;
  skipped?: boolean;
}

export type AgentInstallLogCallback = (line: string) => void;

export interface AgentInstallOnHostInput {
  serverId: string;
  serverHost: string;
  installDir: string;
  onLogLine?: AgentInstallLogCallback;
}

export interface AgentInstallOptions {
  onLogLine?: AgentInstallLogCallback;
}
