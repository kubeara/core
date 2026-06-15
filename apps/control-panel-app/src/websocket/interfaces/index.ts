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

export interface PendingTerminalConnect {
  serverId: string;
  userId: string;
  resolve: (sessionId: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface PendingContainerLogsStart {
  serverId: string;
  userId: string;
  containerId: string;
  sessionId: string;
  resolve: (sessionId: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

import { TerminalTransport } from "@control-panel/modules/terminal/enums/terminal-transport.enum";

export interface TerminalSessionRecord {
  sessionId: string;
  serverId: string;
  userId: string;
  transport: TerminalTransport;
}

export interface ContainerLogsSessionRecord {
  sessionId: string;
  serverId: string;
  userId: string;
  containerId: string;
}
