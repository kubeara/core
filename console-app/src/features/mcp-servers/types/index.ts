import type { EntityStatus } from "@/features/servers/types";

export type McpApiKeyListItem = {
  id: string;
  name: string;
  lastUsedAt: number | null;
  createdAt: number;
  status: EntityStatus;
};

export type CreateMcpApiKeyResult = {
  id: string;
  name: string;
  token: string;
};

export type CreateMcpApiKeyRequest = {
  name: string;
};

export type McpApiKeysApiResponse<T = unknown> = {
  success?: boolean;
  statusCode?: number;
  message: string;
  data?: T;
};

export type SetupGuideConfigPreset =
  | "cursor"
  | "claude-desktop"
  | "windsurf"
  | "antigravity";

export type SetupGuideStep = {
  title: string;
  body: string;
  code?: string;
  configPreset?: SetupGuideConfigPreset;
  configLabel?: string;
  note?: string;
  example?: string;
  followUp?: string;
};

export type SetupGuideTroubleshootingRow = {
  issue: string;
  fix: string;
};

export type SetupGuide = {
  id: string;
  label: string;
  title: string;
  intro: string;
  requirements: string[];
  steps: SetupGuideStep[];
  troubleshooting?: SetupGuideTroubleshootingRow[];
  outro?: string;
  available: boolean;
};
