import { ContainerStatus } from "@/enums/container-status.enum";
import type { ServerContainer } from "@/features/deployments/types";

export type ContainerStatusFilter =
  | ""
  | "offline"
  | "running"
  | "healthy"
  | "restarting"
  | "created"
  | "paused"
  | "exited"
  | "degraded";

export const CONTAINER_STATUS_FILTER_OPTIONS: {
  value: ContainerStatusFilter;
  label: string;
}[] = [
  { value: "", label: "All" },
  { value: "running", label: "Running" },
  { value: "healthy", label: "Healthy" },
  { value: "restarting", label: "Restarting" },
  { value: "created", label: "Created" },
  { value: "paused", label: "Paused" },
  { value: "exited", label: "Exited" },
  { value: "offline", label: "Offline" },
  { value: "degraded", label: "Degraded" },
];

const CONTAINER_STATUS_LABELS: Record<
  Exclude<ContainerStatusFilter, "">,
  string
> = {
  offline: "Offline",
  running: "Running",
  healthy: "Healthy",
  restarting: "Restarting",
  created: "Created",
  paused: "Paused",
  exited: "Exited",
  degraded: "Degraded",
};

export function managedTypeLabel(
  managedType: ServerContainer["managedType"],
): string {
  return managedType === "KUBEARA_MANAGED" ? "Kubeara Managed" : "Self Managed";
}

function normalizeContainerStatus(status: string): string {
  return status.trim().toLowerCase();
}

export function getContainerStatusCategory(
  container: ServerContainer,
): Exclude<ContainerStatusFilter, ""> {
  if (!container.isOnline) {
    return "offline";
  }

  const normalized = normalizeContainerStatus(container.status);

  if (normalized.includes("healthy")) {
    return "healthy";
  }

  if (normalized.includes("restarting")) {
    return "restarting";
  }

  if (
    normalized.includes("exited") ||
    normalized.includes("stopped") ||
    normalized.includes("dead")
  ) {
    return "exited";
  }

  if (normalized.includes("created")) {
    return "created";
  }

  if (normalized.includes("paused")) {
    return "paused";
  }

  if (normalized.includes("up") || normalized.includes("running")) {
    return "running";
  }

  return "degraded";
}

export function isContainerRunning(container: ServerContainer): boolean {
  const category = getContainerStatusCategory(container);
  return (
    category === "running" ||
    category === "healthy" ||
    category === "restarting"
  );
}

export function isContainerExited(container: ServerContainer): boolean {
  return getContainerStatusCategory(container) === "exited";
}

export function isContainerHealthy(container: ServerContainer): boolean {
  return getContainerStatusCategory(container) === "healthy";
}

export function shouldShowDeployedBadge(container: ServerContainer): boolean {
  return (
    container.managedType === "KUBEARA_MANAGED" &&
    container.isOnline &&
    isContainerRunning(container)
  );
}

export function matchesContainerStatusFilter(
  container: ServerContainer,
  statusFilter: ContainerStatusFilter,
): boolean {
  if (!statusFilter) {
    return true;
  }

  return getContainerStatusCategory(container) === statusFilter;
}

export function containerStatusClass(container: ServerContainer): string {
  const category = getContainerStatusCategory(container);

  switch (category) {
    case "offline":
      return ContainerStatus.OFFLINE;
    case "exited":
      return ContainerStatus.STOPPED;
    case "healthy":
      return ContainerStatus.HEALTHY;
    case "running":
    case "restarting":
      return ContainerStatus.RUNNING;
    case "created":
    case "paused":
    case "degraded":
      return ContainerStatus.DEGRADED;
    default:
      return ContainerStatus.DEGRADED;
  }
}

export function getContainerStatusLabel(container: ServerContainer): string {
  const category = getContainerStatusCategory(container);

  if (category === "degraded" && container.status.trim()) {
    return container.status;
  }

  return CONTAINER_STATUS_LABELS[category];
}

export function getContainerServiceName(
  container: ServerContainer,
): string | null {
  const name = container.serviceName?.trim();
  return name || null;
}

export function getContainerDockerName(container: ServerContainer): string {
  const raw = container.containerName?.trim();
  if (!raw) {
    return container.templateId || "Container";
  }

  return raw.replace(/^deployment-\d+-[^-]+-/, "");
}

export function getContainerDisplayName(container: ServerContainer): string {
  return getContainerServiceName(container) ?? getContainerDockerName(container);
}

export function getContainerCardHeadline(container: ServerContainer): string {
  return getContainerDisplayName(container);
}

export function getConnectedTemplateIds(
  containers: ServerContainer[],
): Set<string> {
  return new Set(
    containers
      .filter(
        (container) =>
          container.managedType === "KUBEARA_MANAGED" &&
          container.templateId &&
          container.isOnline,
      )
      .map((container) => container.templateId as string),
  );
}
