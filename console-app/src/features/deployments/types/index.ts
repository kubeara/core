import type {
  DeploymentLogPhase,
  DeploymentLogStreamType,
  DeploymentStatus,
} from "@/constants/deployment-events";

export type { DeploymentStatus, DeploymentLogPhase, DeploymentLogStreamType };

export type StreamStatus =
  | "connecting"
  | "streaming"
  | "complete"
  | "error";

export interface ServerDeploymentSummary {
  id: string;
  templateSlug: string;
  serverId: string | null;
  deploymentStatus: DeploymentStatus;
  statusMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DeploymentDetail {
  id: string;
  templateSlug: string;
  serverId: string | null;
  deploymentStatus: DeploymentStatus;
  statusMessage: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DeployTemplateInput {
  templateSlug: string;
  serverId: string;
  env?: Record<string, string>;
  ports?: Record<string, string>;
}

export interface DeployTemplateResult {
  message: string;
  template: string;
  deploymentId: string;
  serverId: string;
  mode?: string;
  publicUrl?: string;
}

export interface DeploymentLogLine {
  id: string;
  message: string;
  timestamp: string;
  phase: DeploymentLogPhase;
  stream: DeploymentLogStreamType;
  containerId?: string;
  containerName?: string;
}
