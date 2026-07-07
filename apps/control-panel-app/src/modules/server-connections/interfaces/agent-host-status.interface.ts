import { AgentHostPresence } from "../enums/agent-host-presence.enum";

export interface AgentHostStatus {
  presence: AgentHostPresence;
  containerId?: string;
  containerStatus?: string;
}
