import type { ServerOperationStatus } from "@/types";

export type ServerOperationUpdatedPayload = {
  serverId: string;
  operationStatus: ServerOperationStatus | null;
  operationError?: string | null;
  deleted?: boolean;
  timestamp: string;
};
