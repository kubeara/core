export interface AgentHealthError {
  message: string;
  stack?: string;
  timestamp: number;
  serverId?: string;
  containerId?: string;
  containerStatus?: string;
}

export type AgentHealthErrorInput = Omit<AgentHealthError, "timestamp">;
