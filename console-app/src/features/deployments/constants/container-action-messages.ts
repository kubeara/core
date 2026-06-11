import type {
  ContainerActionExecutionPath,
  ContainerActionType,
} from "../types";

export const CONTAINER_ACTION_LABELS: Record<ContainerActionType, string> = {
  stop: "Stop",
  restart: "Restart",
  delete: "Delete",
};

export const CONTAINER_ACTION_PENDING_LABELS: Record<
  ContainerActionType,
  string
> = {
  stop: "Stopping…",
  restart: "Restarting…",
  delete: "Deleting…",
};

export const CONTAINER_ACTION_CONFIRM_TITLES: Record<
  ContainerActionType,
  string
> = {
  stop: "Stop?",
  restart: "Restart?",
  delete: "Delete?",
};

export const CONTAINER_ACTION_CONFIRM_MESSAGES: Record<
  ContainerActionType,
  string
> = {
  stop: "The container will stop running until you start it again.",
  restart: "The container will shut down and start again. It may be briefly unavailable.",
  delete:
    "This removes the container, its image, and any dedicated Docker networks from the server. This cannot be undone.",
};

export const CONTAINER_ACTION_CONFIRM_BUTTONS: Record<
  ContainerActionType,
  string
> = {
  stop: "Stop",
  restart: "Restart",
  delete: "Delete",
};

export const CONTAINER_ACTION_API_ERRORS: Record<ContainerActionType, string> = {
  stop: "Failed to stop the container.",
  restart: "Failed to restart the container.",
  delete: "Failed to delete the container.",
};

const EXECUTION_PATH_LABELS: Record<ContainerActionExecutionPath, string> = {
  agent: "via agent",
  host: "via server host (agent unavailable)",
};

export function getContainerActionConfirmBody(
  action: ContainerActionType,
  containerName: string,
): string {
  return `${CONTAINER_ACTION_CONFIRM_MESSAGES[action]} Container: ${containerName}.`;
}

export function getContainerActionSuccessMessage(
  action: ContainerActionType,
  containerName: string,
  executedVia: ContainerActionExecutionPath,
): string {
  const via = EXECUTION_PATH_LABELS[executedVia];
  const messages: Record<ContainerActionType, string> = {
    stop: `Container "${containerName}" was stopped successfully (${via}).`,
    restart: `Container "${containerName}" was restarted successfully (${via}).`,
    delete: `Container "${containerName}" and its resources were removed successfully (${via}).`,
  };
  return messages[action];
}

export function getContainerActionErrorMessage(
  action: ContainerActionType,
  containerName: string,
  errorMessage: string,
): string {
  const detail = errorMessage.trim() || CONTAINER_ACTION_API_ERRORS[action];
  return `Could not ${action} "${containerName}". ${detail}`;
}
