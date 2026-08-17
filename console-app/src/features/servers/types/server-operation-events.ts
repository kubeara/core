import type { ServerOperationStatus } from "@/types";

export type ServerOperationUpdatedPayload = {
  serverId: string;
  operationStatus: ServerOperationStatus | null;
  serverError?: string | null;
  agentError?: string | null;
  deleted?: boolean;
  timestamp: string;
};
