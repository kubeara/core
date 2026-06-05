import { DiscoveredContainerPayload } from "@shared/socket-events/deployment.events";

export interface PendingContainerDiscovery {
  serverId: string;
  resolve: (containers: DiscoveredContainerPayload[]) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}
