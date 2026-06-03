export const DEPLOYMENT_SOCKET_EVENTS = {
  DEPLOYMENT_STATUS: "deployment:status",
  LOGS_SUBSCRIBE: "logs:subscribe",
  DEPLOYMENT_STREAM: "deployment:stream",
  AGENT_CONNECTED: "agent:connected",
  AGENT_DISCONNECTED: "agent:disconnected",
} as const;

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

export type DeploymentStatus =
  | "pending"
  | "validating"
  | "pulling"
  | "building"
  | "deploying"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "removing"
  | "removed"
  | "unknown";

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
  "success",
  "failed",
  "cancelled",
  "removed",
];

export function isTerminalDeploymentStatus(
  status: DeploymentStatus | null | undefined,
): boolean {
  return status != null && TERMINAL_STATUSES.includes(status);
}
