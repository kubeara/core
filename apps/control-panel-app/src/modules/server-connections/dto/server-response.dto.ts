import { EntityStatus } from "../../../common/entity/base.entity";
import { ServerProvider } from "../enums/server-provider.enum";
import { ServerType } from "../enums/server-type.enum";

export type ServerOperationStatusDto = "starting" | "removing";

export interface ServerResponseDto {
  id: string;
  status: EntityStatus;
  metadata: Record<string, unknown> | null;
  name: string;
  host: string;
  port: number;
  username: string;
  provider: ServerProvider;
  region: string | null;
  operatingSystem: string | null;
  serverType: ServerType;
  lastConnectedAt: number | null;
  connected: boolean;
  agentConnected: boolean;
  operationStatus: ServerOperationStatusDto | null;
  serverError: string | null;
  agentError: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}
