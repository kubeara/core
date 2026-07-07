import { AgentHostPresence } from "../enums/agent-host-presence.enum";

export interface AgentHealthTickResult {
  serverId: string | null;
  presence: AgentHostPresence | null;
  nextServerIndex: number;
}
