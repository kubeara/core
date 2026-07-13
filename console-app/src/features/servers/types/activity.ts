import type { DeploymentStatus } from "@/constants/deployment-events";

export type ActivityType =
  | "deployment"
  | "deployment_remove"
  | "deployment_validation_stopped"
  | "container_start"
  | "container_stop"
  | "container_restart"
  | "container_delete"
  | "container_logs"
  | "terminal_opened"
  | "terminal_disconnected"
  | "server_added"
  | "server_deleted";

export type ActivityListItem = {
  id: string;
  serverId: string;
  type: ActivityType;
  title: string;
  message: string | null;
  operationStatus: DeploymentStatus;
  deploymentId: string | null;
  templateSlug: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ActivityDetail = ActivityListItem;
