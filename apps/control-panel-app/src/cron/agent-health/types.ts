export interface AgentHealthError extends Record<string, unknown> {
  message: string;
  stack?: string;
  timestamp: number;
  serverId?: string;
}
