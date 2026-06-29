import { apiClient } from "@/api/axios";
import { unwrapServerApiData } from "@/features/servers/utils/server-api-error";
import type {
  ContainerActionResult,
  ContainerActionType,
  DeployTemplateInput,
  DeployTemplateResult,
  DeploymentDetail,
  DeploymentResourceWarning,
  ServerContainer,
  ServerDeploymentSummary,
  ValidateDeploymentResourcesResult,
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
    skipResourceValidation: input.skipResourceValidation,
  });
  return unwrapServerApiData<DeployTemplateResult>(
    responseBody(response),
    "Failed to start deployment",
  );
}

export async function validateDeploymentResources(
  input: DeployTemplateInput,
): Promise<ValidateDeploymentResourcesResult> {
  const response = await apiClient.post("/deployments/resources/check", {
    templateSlug: input.templateSlug,
    serverId: input.serverId,
    env: input.env ?? {},
    ports: input.ports ?? {},
  });
  const data = unwrapServerApiData<
    | { available: true }
    | { available: false; warning: DeploymentResourceWarning }
  >(responseBody(response), "Failed to validate deployment resources");

  if (!data.available && data.warning) {
    return { ok: false, warning: data.warning };
  }

  return { ok: true };
}

export async function executeContainerAction(
  serverId: string,
  containerId: string,
  action: ContainerActionType,
): Promise<ContainerActionResult> {
  const encodedServerId = encodeURIComponent(serverId);
  const encodedContainerId = encodeURIComponent(containerId);

  const response =
    action === "delete"
      ? await apiClient.delete(
          `/deployments/${encodedServerId}/containers/${encodedContainerId}`,
        )
      : await apiClient.post(
          `/deployments/${encodedServerId}/containers/${encodedContainerId}/${action}`,
        );

  return unwrapServerApiData<ContainerActionResult>(
    responseBody(response),
    `Failed to ${action} container`,
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

export interface ContainerLogsSession {
  sessionId: string;
  serverId: string;
  containerId: string;
}

export async function startContainerLogs(
  serverId: string,
  containerId: string,
): Promise<ContainerLogsSession> {
  const response = await apiClient.post(
    `/deployments/${encodeURIComponent(serverId)}/containers/${encodeURIComponent(containerId)}/logs/start`,
  );

  return unwrapServerApiData<ContainerLogsSession>(
    responseBody(response),
    "Failed to start container logs",
  );
}

export async function stopContainerLogs(
  serverId: string,
  sessionId: string,
): Promise<void> {
  await apiClient.post(
    `/deployments/${encodeURIComponent(serverId)}/containers/logs/stop`,
    { sessionId },
  );
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
