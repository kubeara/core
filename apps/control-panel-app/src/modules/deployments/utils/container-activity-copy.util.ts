import type { ContainerActionType } from "@shared/socket-events";

import { normalizeDockerContainerName } from "./container-discovery.util";

/**
 * Builds a short display label from a container id when the name is unknown.
 *
 * @param containerId - Docker container id or prefix.
 * @returns Truncated id suitable for activity titles.
 */
export function shortContainerLabel(containerId: string): string {
  const trimmed = containerId.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return trimmed.slice(0, 12);
}

/**
 * Resolves the human label used in activity title/message for container ops.
 *
 * @param containerId - Docker container id (fallback when name is missing).
 * @param preferredName - Optional name from the console (preferred).
 * @returns Normalized container name or a short id.
 */
export function resolveActivityContainerLabel(
  containerId: string,
  preferredName?: string | null,
): string {
  const fromPreferred = preferredName?.trim()
    ? normalizeDockerContainerName(preferredName)
    : "";
  return fromPreferred || shortContainerLabel(containerId);
}

const ACTION_TITLE: Record<ContainerActionType, string> = {
  start: "Start",
  stop: "Stop",
  restart: "Restart",
  delete: "Delete",
};

const ACTION_PAST: Record<ContainerActionType, string> = {
  start: "started",
  stop: "stopped",
  restart: "restarted",
  delete: "deleted",
};

const ACTION_PROGRESS: Record<ContainerActionType, string> = {
  start: "Starting",
  stop: "Stopping",
  restart: "Restarting",
  delete: "Deleting",
};

/**
 * Builds an activity title for a container lifecycle action.
 *
 * @param action - Container action type.
 * @param containerLabel - Display name for the container.
 * @returns Title such as "Start · n8n".
 */
export function containerActionActivityTitle(
  action: ContainerActionType,
  containerLabel: string,
): string {
  return `${ACTION_TITLE[action]} · ${containerLabel}`;
}

/**
 * Builds the in-progress activity message for a container action.
 *
 * @param action - Container action type.
 * @param containerLabel - Display name for the container.
 * @returns Message such as "Starting n8n…".
 */
export function containerActionActivityStartedMessage(
  action: ContainerActionType,
  containerLabel: string,
): string {
  return `${ACTION_PROGRESS[action]} ${containerLabel}…`;
}

/**
 * Builds the success activity message for a container action.
 *
 * @param action - Container action type.
 * @param containerLabel - Display name for the container.
 * @param executedVia - Whether the action ran on the agent or host fallback.
 * @returns Past-tense success message.
 */
export function containerActionActivitySuccessMessage(
  action: ContainerActionType,
  containerLabel: string,
  executedVia: "agent" | "host",
): string {
  const via =
    executedVia === "agent"
      ? "via agent"
      : "via server host (agent unavailable or outdated)";
  return `${containerLabel} ${ACTION_PAST[action]} ${via}.`;
}

/**
 * Builds the failure activity message for a container action.
 *
 * @param action - Container action type.
 * @param containerLabel - Display name for the container.
 * @param error - Error text to append.
 * @returns Failure message including the error.
 */
export function containerActionActivityFailedMessage(
  action: ContainerActionType,
  containerLabel: string,
  error: string,
): string {
  return `Failed to ${action} ${containerLabel}: ${error}`;
}

/**
 * Builds an activity title for a container log session.
 *
 * @param containerLabel - Display name for the container.
 * @returns Title such as "Logs · redis".
 */
export function containerLogsActivityTitle(containerLabel: string): string {
  return `Logs · ${containerLabel}`;
}
