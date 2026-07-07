import {
  ContainerActionResponsePayload,
  DeploymentValidateResponsePayload,
  DiscoveredContainerPayload,
  ServerResourcesMetricsPayload,
} from "@shared/socket-events/deployment.events";

export interface PendingDeploymentValidate {
  serverId: string;
  resolve: (result: DeploymentValidateResponsePayload) => void;
  reject: (error: Error) => void;
  cancelTimeout: () => void;
}

export interface PendingContainerDiscovery {
  serverId: string;
  resolve: (containers: DiscoveredContainerPayload[]) => void;
  reject: (error: Error) => void;
  cancelTimeout: () => void;
}

export interface PendingServerResources {
  serverId: string;
  resolve: (resources: ServerResourcesMetricsPayload) => void;
  reject: (error: Error) => void;
  cancelTimeout: () => void;
}

/**
 * Represents a pending container action request.
 */
export interface PendingContainerAction {
  serverId: string;
  resolve: (result: ContainerActionResponsePayload) => void;
  reject: (error: Error) => void;
  cancelTimeout: () => void;
}

export interface PendingDeploymentRemove {
  serverId: string;
  resolve: () => void;
  reject: (error: Error) => void;
  cancelTimeout: () => void;
}

export interface PendingAgentRemove {
  serverId: string;
  resolve: (result: { imageRefs: string[] }) => void;
  reject: (error: Error) => void;
  cancelTimeout: () => void;
}

export interface PendingTerminalConnect {
  serverId: string;
  userId: string;
  resolve: (sessionId: string) => void;
  reject: (error: Error) => void;
  cancelTimeout: () => void;
}

export interface PendingContainerLogsStart {
  serverId: string;
  userId: string;
  containerId: string;
  sessionId: string;
  resolve: (sessionId: string) => void;
  reject: (error: Error) => void;
  cancelTimeout: () => void;
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
