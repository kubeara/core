import type { DeploymentStatus } from "@shared/socket-events";

import type { ActivityType } from "../enums/activity-type.enum";

export interface ActivityListItem {
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
}

export type ActivityDetail = ActivityListItem;

export interface StartActivityInput {
  userId: string;
  serverId: string;
  type: ActivityType;
  title: string;
  message?: string | null;
  deploymentId?: string | null;
  templateSlug?: string | null;
  operationStatus?: DeploymentStatus;
}

export interface UpdateActivityStatusInput {
  operationStatus: DeploymentStatus;
  message?: string | null;
  title?: string | null;
  type?: ActivityType;
}
