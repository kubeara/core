import type { ServerUrlContext } from "@shared/common";
import type { TemplateSchema } from "@shared/socket-events";

export interface PrepareDeploymentInput {
  templateSlug: string;
  serverId: string;
  userId: string;
  requestEnv?: Record<string, unknown>;
  requestPorts?: Record<string, unknown>;
  /** When set, load stored variables and merge request overrides (redeploy). */
  existingDeploymentId?: string;
  /** When false, resolve variables without creating a deployment record. */
  persist?: boolean;
  /** Agent/server context for SERVICE_URL_* / SERVICE_FQDN_* generation (deploymentId added internally). */
  serverUrlContext?: Omit<ServerUrlContext, "deploymentId">;
}

export interface BuildServerUrlContextInput {
  userId: string;
  serverId: string;
  useTraefikRequest?: boolean;
  requestEnv?: Record<string, unknown>;
  requestPorts?: Record<string, unknown>;
}

export interface ResolveDeploymentServerInput {
  userId: string;
  serverId?: string;
  deployOnLocal?: boolean;
  existingDeploymentId?: string;
}

export interface ResolvedDeploymentTarget {
  serverId: string;
  userId: string;
}

export interface PreparedDeployment {
  deploymentId: string;
  serverId: string;
  userId: string;
  templateSlug: string;
  encodedCompose: string;
  mergedEnv: Record<string, string>;
  mergedPorts: Record<string, number>;
  generatedKeys: string[];
  schema?: TemplateSchema;
  composeOnly?: boolean;
  useTraefik?: boolean;
}
