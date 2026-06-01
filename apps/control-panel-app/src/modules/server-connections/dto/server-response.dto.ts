import { EntityStatus } from "../../../common/entity/base.entity";
import { ServerProvider } from "../enums/server-provider.enum";
import { ServerType } from "../enums/server-type.enum";

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
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}
