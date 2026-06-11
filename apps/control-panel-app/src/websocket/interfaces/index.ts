import {
  ContainerActionResponsePayload,
  DiscoveredContainerPayload,
  ServerResourcesMetricsPayload,
} from "@shared/socket-events/deployment.events";

export interface PendingContainerDiscovery {
  serverId: string;
  resolve: (containers: DiscoveredContainerPayload[]) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface PendingServerResources {
  serverId: string;
  resolve: (resources: ServerResourcesMetricsPayload) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface PendingContainerAction {
  serverId: string;
  resolve: (result: ContainerActionResponsePayload) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}
