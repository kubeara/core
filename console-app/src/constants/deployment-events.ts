export const DEPLOYMENT_SOCKET_EVENTS = {
  DEPLOYMENT_STATUS: "deployment:status",
  LOGS_SUBSCRIBE: "logs:subscribe",
  DEPLOYMENT_STREAM: "deployment:stream",
  AGENT_CONNECTED: "agent:connected",
  AGENT_DISCONNECTED: "agent:disconnected",
  SERVER_OPERATION_UPDATED: "server:operation-updated",
  TERMINAL_SUBSCRIBE: "terminal:subscribe",
  TERMINAL_INPUT: "terminal:input",
  TERMINAL_OUTPUT: "terminal:output",
  TERMINAL_RESIZE: "terminal:resize",
  TERMINAL_DISCONNECT: "terminal:disconnect",
  CONTAINER_LOGS_SUBSCRIBE: "container:logs:subscribe",
  CONTAINER_LOGS_DATA: "container:logs:data",
  CONTAINER_LOGS_STOP: "container:logs:stop",
  CONTAINER_LOGS_ERROR: "container:logs:error",
} as const;

export interface TerminalOutputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalDisconnectPayload {
  sessionId: string;
}

export interface ContainerLogsDataPayload {
  sessionId: string;
  data: string;
}

export interface ContainerLogsStopPayload {
  sessionId: string;
}

export interface ContainerLogsErrorPayload {
  sessionId: string;
  error: string;
}

export type DeploymentLogPhase = "install" | "deploy" | "container";

export type DeploymentLogStreamType = "stdout" | "stderr";

/** Unified log line from control panel → console (`deployment:stream`). */
export interface DeploymentLogStreamPayload {
  deploymentId: string;
  serverId?: string;
  containerId?: string;
  containerName?: string;
  phase: DeploymentLogPhase;
  source: "install" | "deployment" | "container";
  stream: DeploymentLogStreamType;
  timestamp: string;
  message: string;
}

/**
 * Current state of a deployment across prepare, agent execution, and removal.
 */
export enum DeploymentStatus {
  PENDING = "pending",
  VALIDATING = "validating",
  PULLING = "pulling",
  BUILDING = "building",
  DEPLOYING = "deploying",
  RUNNING = "running",
  SUCCESS = "success",
  FAILED = "failed",
  CANCELLED = "cancelled",
  REMOVING = "removing",
  REMOVED = "removed",
  UNKNOWN = "unknown",
}

export interface SocketDeploymentStatus {
  deploymentId: string;
  templateSlug: string;
  status: DeploymentStatus;
  progress?: number;
  message?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  agentId?: string;
  serverId?: string;
  receivedAt?: string;
}

const TERMINAL_STATUSES: DeploymentStatus[] = [
  DeploymentStatus.SUCCESS,
  DeploymentStatus.FAILED,
  DeploymentStatus.CANCELLED,
  DeploymentStatus.REMOVED,
];

export function isTerminalDeploymentStatus(
  status: DeploymentStatus | null | undefined,
): boolean {
  return status != null && TERMINAL_STATUSES.includes(status);
}
