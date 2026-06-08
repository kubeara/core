import { apiClient } from "@/api/axios";
import { unwrapServerApiData } from "@/features/servers/utils/server-api-error";
import type {
  DeployTemplateInput,
  DeployTemplateResult,
  DeploymentDetail,
  ServerContainer,
  ServerDeploymentSummary,
} from "../types";

function responseBody(response: { data: unknown }): Record<string, unknown> {
  return response.data as Record<string, unknown>;
}

export async function deployTemplate(
  input: DeployTemplateInput,
): Promise<DeployTemplateResult> {
  const response = await apiClient.post("/deployments/compose", {
    templateSlug: input.templateSlug,
    serverId: input.serverId,
    env: input.env ?? {},
    ports: input.ports ?? {},
  });
  return unwrapServerApiData<DeployTemplateResult>(
    responseBody(response),
    "Failed to start deployment",
  );
}

export async function fetchServerContainers(
  serverId: string,
): Promise<ServerContainer[]> {
  const response = await apiClient.get(
    `/deployments/${encodeURIComponent(serverId)}/containers`,
  );
  const data = unwrapServerApiData<{ containers: ServerContainer[] }>(
    responseBody(response),
    "Failed to load server containers",
  );
  return data.containers ?? [];
}

export async function fetchServerDeployments(
  serverId: string,
): Promise<ServerDeploymentSummary[]> {
  const response = await apiClient.get(
    `/deployments?serverId=${encodeURIComponent(serverId)}`,
  );
  return unwrapServerApiData<ServerDeploymentSummary[]>(
    responseBody(response),
    "Failed to load deployments",
  );
}

/**
 * Fetches the details of a deployment.
 */
export async function fetchDeployment(
  deploymentId: string,
): Promise<DeploymentDetail> {
  const response = await apiClient.get(`/deployments/${deploymentId}`);
  const data = unwrapServerApiData<Record<string, unknown>>(
    responseBody(response),
    "Failed to load deployment",
  );

  return {
    id: String(data.id ?? deploymentId),
    templateSlug: String(data.templateSlug ?? ""),
    serverId: (data.serverId as string | null) ?? null,
    deploymentStatus: data.deploymentStatus as DeploymentDetail["deploymentStatus"],
    statusMessage: (data.statusMessage as string | null) ?? null,
    lastError: (data.lastError as string | null) ?? null,
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
  };
}
