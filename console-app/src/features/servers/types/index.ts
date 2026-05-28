import type { Server, ServerStatus } from "@/types";

export type EntityStatus = "ACTIVE" | "INACTIVE";

export type ServerProvider =
  | "CUSTOM"
  | "AWS"
  | "AZURE"
  | "GCP"
  | "DIGITAL_OCEAN"
  | "HETZNER"
  | "LINODE"
  | "ON_PREMISE";

export type ServerType = "BARE_METAL" | "VIRTUAL_MACHINE" | "CONTAINER_HOST";

export type ServerSshAuthType = "PASSWORD" | "PRIVATE_KEY";

export type ServerListSortField = "name" | "host" | "status" | "createdAt";

export type ServerApiResponse = {
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
};

export type ServersListParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: EntityStatus;
  provider?: ServerProvider;
  serverType?: ServerType;
  connected?: boolean;
  sortBy?: ServerListSortField;
  sortOrder?: "asc" | "desc";
};

export type PaginatedServersResponse = {
  data: ServerApiResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type OnboardServerRequest = {
  server: {
    name: string;
    host: string;
    username: string;
    port?: number;
    provider?: ServerProvider;
    region?: string;
    operatingSystem?: string;
    serverType?: ServerType;
  };
  ssh: {
    authType: ServerSshAuthType;
    password?: string;
    privateKey?: string;
    privateKeyPassphrase?: string;
    sshFingerprint?: string;
  };
  installAgent?: boolean;
};

export type OnboardSuccessData = {
  serverId: string;
  sshCredentialId: string;
  sshTest: { success: true };
  agentInstall?: {
    success: boolean;
    logs: string[];
    error?: string;
    skipped?: boolean;
  };
};

export type UpdateServerRequest = {
  name: string;
};

export type ServerActionMessageResponse = {
  message: string;
};

export type ServersApiResponse<T = unknown> = {
  success: boolean;
  statusCode?: number;
  message: string;
  data?: T;
  error?: string;
  errorCode?: string;
};

export function mapServerApiToServer(api: ServerApiResponse): Server {
  return {
    id: api.id,
    name: api.name,
    username: api.username,
    host: api.host,
    status: api.connected ? "online" : "offline",
    createdAt: new Date(api.createdAt * 1000).toISOString(),
  };
}

export function mapStatusFilterToQuery(
  status: ServerStatus | "",
): Partial<ServersListParams> {
  switch (status) {
    case "online":
      return { connected: true };
    case "offline":
      return { connected: false };
    case "error":
      return { status: "INACTIVE" };
    case "pending":
      return { connected: false };
    default:
      return {};
  }
}
