import { APP_CONFIG } from "@shared/common";
import type { DiscoveredContainerPayload } from "@shared/socket-events";

import { ManagedType } from "../enums/managed-type.enum";
import type { ServerContainerDto } from "../dto/server-container.dto";
import type { DeploymentMatchRecord } from "../interfaces/container-discovery.interfaces";

const EXCLUDED_CONTAINER_NAMES = new Set(["kubeara-agent", "traefik"]);

export function sanitizeDeploymentProjectName(deploymentId: string): string {
  return deploymentId.replace(APP_CONFIG.REGEX.SANITIZATION, "").toLowerCase();
}

export function normalizeDockerContainerName(rawNames: string): string {
  const first = rawNames.split(",")[0]?.trim() ?? rawNames.trim();
  return first.replace(/^\//, "");
}

function isInfrastructureContainer(containerName: string): boolean {
  const lower = containerName.toLowerCase();
  if (EXCLUDED_CONTAINER_NAMES.has(lower)) {
    return true;
  }
  return lower.startsWith("kubeara-traefik");
}

/**
 * Finds a deployment for a container by container ID or compose project name.
 */
function findDeploymentForContainer(
  container: DiscoveredContainerPayload,
  deployments: DeploymentMatchRecord[],
): DeploymentMatchRecord | undefined {
  const containerId = container.containerId.trim();
  const containerName = normalizeDockerContainerName(container.containerName);
  const composeProject = container.composeProject?.trim().toLowerCase();

  if (composeProject) {
    const byProject = deployments.find(
      (deployment) => deployment.composeProject === composeProject,
    );
    if (byProject) {
      return byProject;
    }
  }

  for (const deployment of deployments) {
    if (containerId && deployment.id === containerId) {
      return deployment;
    }
  }

  for (const deployment of deployments) {
    const project = deployment.composeProject;
    if (!project) {
      continue;
    }
    if (
      containerName === project ||
      containerName.startsWith(`${project}-`) ||
      containerName.startsWith(`${project}_`)
    ) {
      return deployment;
    }
  }

  return undefined;
}

/**
 * Sorts containers by managed type and online status.
 */
function sortContainers(
  containers: ServerContainerDto[],
): ServerContainerDto[] {
  const rank = (row: ServerContainerDto): number => {
    if (row.managedType === ManagedType.KUBEARA_MANAGED && row.isOnline) {
      return 0;
    }
    if (row.managedType === ManagedType.SELF_MANAGED && row.isOnline) {
      return 1;
    }
    if (row.managedType === ManagedType.KUBEARA_MANAGED && !row.isOnline) {
      return 2;
    }
    return 3;
  };

  return [...containers].sort((left, right) => {
    const byRank = rank(left) - rank(right);
    if (byRank !== 0) {
      return byRank;
    }
    return left.containerName.localeCompare(right.containerName);
  });
}

/**
 * Merges discovered containers with deployments and returns a list of server containers.
 */
export function mergeDiscoveredContainersWithDeployments(
  discovered: DiscoveredContainerPayload[],
  deployments: DeploymentMatchRecord[],
  serverId: string,
): ServerContainerDto[] {
  const matchedDeploymentIds = new Set<string>();
  const rows: ServerContainerDto[] = [];

  for (const container of discovered) {
    const containerName = normalizeDockerContainerName(container.containerName);
    if (!containerName || isInfrastructureContainer(containerName)) {
      continue;
    }

    const deployment = findDeploymentForContainer(container, deployments);
    if (deployment) {
      matchedDeploymentIds.add(deployment.id);
    }

    rows.push({
      containerId: container.containerId,
      containerName,
      imageName: container.imageName,
      status: container.status,
      ports: container.ports,
      runningSince: container.runningSince,
      managedType: deployment
        ? ManagedType.KUBEARA_MANAGED
        : ManagedType.SELF_MANAGED,
      deploymentId: deployment?.id ?? null,
      templateId: deployment?.templateSlug ?? null,
      serviceName: deployment?.serviceName ?? null,
      serverId,
      isOnline: true,
    });
  }

  for (const deployment of deployments) {
    if (matchedDeploymentIds.has(deployment.id)) {
      continue;
    }

    rows.push({
      containerId: null,
      containerName: deployment.serviceName ?? deployment.templateSlug,
      imageName: "",
      status: "offline",
      ports: "",
      runningSince: "",
      managedType: ManagedType.KUBEARA_MANAGED,
      deploymentId: deployment.id,
      templateId: deployment.templateSlug,
      serviceName: deployment.serviceName,
      serverId,
      isOnline: false,
    });
  }

  return sortContainers(rows);
}
