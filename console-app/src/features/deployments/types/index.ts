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
  acknowledgeResourceWarning?: boolean;
}

export type DeploymentResourceWarningCode =
  | "insufficient_ram"
  | "insufficient_cpu";

export interface DeploymentResourceWarning {
  code: DeploymentResourceWarningCode;
  message: string;
}

export type ValidateDeploymentResourcesResult =
  | { ok: true }
  | { ok: false; warning: DeploymentResourceWarning };

export type ManagedType = "KUBEARA_MANAGED" | "SELF_MANAGED";

export interface ServerContainer {
  containerId: string | null;
  containerName: string;
  imageName: string;
  status: string;
  ports: string;
  runningSince: string;
  lastRestarted?: string;
  managedType: ManagedType;
  deploymentId: string | null;
  templateId: string | null;
  serviceName: string | null;
  serverId: string;
  isOnline: boolean;
}

export interface DeployTemplateResult {
  message: string;
  template: string;
  deploymentId: string;
  serverId: string;
  mode?: string;
  publicUrl?: string;
}

export type ContainerActionType = "stop" | "start" | "restart" | "delete";

export type ContainerActionExecutionPath = "agent" | "host";

export interface ContainerActionResult {
  action: ContainerActionType;
  containerId: string;
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executedVia: ContainerActionExecutionPath;
  message: string;
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
