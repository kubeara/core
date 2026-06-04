import type { DeploymentLogLine } from "../types";

export type DeploymentLogView = "installation" | "container";

export function isInstallationLogLine(line: DeploymentLogLine): boolean {
  return line.phase === "install" || line.phase === "deploy";
}

export function isContainerLogLine(line: DeploymentLogLine): boolean {
  return line.phase === "container";
}

export function filterDeploymentLogsByView(
  logs: DeploymentLogLine[],
  view: DeploymentLogView,
): DeploymentLogLine[] {
  return logs.filter(
    view === "installation" ? isInstallationLogLine : isContainerLogLine,
  );
}

export function countDeploymentLogsByView(
  logs: DeploymentLogLine[],
  view: DeploymentLogView,
): number {
  return filterDeploymentLogsByView(logs, view).length;
}

export function hasContainerDeploymentLogs(logs: DeploymentLogLine[]): boolean {
  return logs.some(isContainerLogLine);
}
