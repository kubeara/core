import { ContainerStatus } from "@/enums/container-status.enum";
import type { ServerContainer } from "@/features/deployments/types";

export function managedTypeLabel(
  managedType: ServerContainer["managedType"],
): string {
  return managedType === "KUBEARA_MANAGED" ? "Kubeara Managed" : "Self Managed";
}

export function containerStatusClass(container: ServerContainer): string {
  if (!container.isOnline) {
    return ContainerStatus.OFFLINE;
  }
  const normalized = container.status.toLowerCase();
  if (normalized.includes("up") || normalized.includes("running")) {
    return ContainerStatus.RUNNING;
  }
  if (normalized.includes("exited") || normalized.includes("stopped")) {
    return ContainerStatus.STOPPED;
  }
  return ContainerStatus.DEGRADED;
}

export function getContainerDisplayName(container: ServerContainer): string {
  const displayName =
    container.containerName || container.templateId || "Container";
  return displayName.replace(/^deployment-\d+-[^-]+-/, "");
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
