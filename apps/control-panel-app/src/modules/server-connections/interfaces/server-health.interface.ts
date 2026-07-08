export interface ServerAgentError {
  message: string;
  serverId: string;
  host: string;
  checkedAt: number;
  retryCount: number;
  /** True while recoverAgentForServer is running. */
  recoveryInProgress?: boolean;
}

export interface ServerHealthError {
  message: string;
  checkedAt: number;
}

export interface AgentHealthCronResult {
  processed: boolean;
  serverId?: string;
  connected?: boolean;
  recoveryTriggered?: boolean;
}
