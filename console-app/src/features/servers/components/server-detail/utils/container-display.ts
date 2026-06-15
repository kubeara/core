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

export function getContainerCardSubtitle(
  container: ServerContainer,
): string | null {
  if (container.managedType === "KUBEARA_MANAGED" && container.templateId) {
    return container.templateId;
  }

  const dockerName = getContainerDockerName(container);
  const headline = getContainerCardHeadline(container);
  return dockerName !== headline ? dockerName : null;
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
