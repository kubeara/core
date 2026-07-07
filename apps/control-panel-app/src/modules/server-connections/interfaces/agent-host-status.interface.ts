export type AgentHostPresence = "connected" | "running" | "stopped" | "missing";

export interface AgentHostStatus {
  presence: AgentHostPresence;
  containerId?: string;
  containerStatus?: string;
}
