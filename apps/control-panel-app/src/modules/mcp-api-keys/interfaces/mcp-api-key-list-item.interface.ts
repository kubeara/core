import { EntityStatus } from "@control-panel/common/entity/entity-status";

export interface McpApiKeyListItem {
  id: string;
  name: string;
  lastUsedAt: number | null;
  createdAt: number;
  revokedAt: number | null;
  status: EntityStatus;
}
