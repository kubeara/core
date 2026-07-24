import type { ContainerActionType } from "../types";

export const CONTAINER_ACTION_LABELS: Record<ContainerActionType, string> = {
  stop: "Stop",
  start: "Start",
  restart: "Restart",
  delete: "Delete",
};

export const CONTAINER_ACTION_PENDING_LABELS: Record<
  ContainerActionType,
  string
> = {
  stop: "Stopping…",
  start: "Starting…",
  restart: "Restarting…",
  delete: "Deleting…",
};

export const CONTAINER_ACTION_CONFIRM_TITLES: Record<
  ContainerActionType,
  string
> = {
  stop: "Stop?",
  start: "Start?",
  restart: "Restart?",
  delete: "Delete?",
};

export const CONTAINER_ACTION_CONFIRM_MESSAGES: Record<
  ContainerActionType,
  string
> = {
  stop: "The container will stop running until you start it again.",
  start: "The container will start running on this server.",
  restart: "The container will shut down and start again. It may be briefly unavailable.",
  delete:
    "This stops and removes the container, its image, and mounted data volumes. Docker networks are kept on the server.",
};

export const CONTAINER_ACTION_CONFIRM_BUTTONS: Record<
  ContainerActionType,
  string
> = {
  stop: "Stop",
  start: "Start",
  restart: "Restart",
  delete: "Delete",
};

export const CONTAINER_ACTION_API_ERRORS: Record<ContainerActionType, string> = {
  stop: "Failed to stop the container.",
  start: "Failed to start the container.",
  restart: "Failed to restart the container.",
  delete: "Failed to delete the container.",
};

const KUBEARA_AGENT_ACTION_VERBS: Record<ContainerActionType, string> = {
  stop: "stop",
  start: "start",
  restart: "restart",
  delete: "delete",
};

const KUBEARA_AGENT_ACTION_PAST_PARTICIPLES: Record<
  ContainerActionType,
  string
> = {
  stop: "stopped",
  start: "started",
  restart: "restarted",
  delete: "deleted",
};

export function getKubearaAgentActionWarningTitle(
  action: ContainerActionType,
): string {
  return `Cannot ${KUBEARA_AGENT_ACTION_VERBS[action]} Kubeara Agent`;
}

export function getKubearaAgentActionWarningMessage(
  action: ContainerActionType,
): string {
  return `The Kubeara Agent is required to manage this server and cannot be ${KUBEARA_AGENT_ACTION_PAST_PARTICIPLES[action]}.`;
}

export function getContainerActionConfirmBody(
  action: ContainerActionType,
  containerName: string,
): string {
  return `${CONTAINER_ACTION_CONFIRM_MESSAGES[action]} Container: ${containerName}.`;
}

export function getContainerActionSuccessMessage(
  action: ContainerActionType,
  containerName: string,
): string {
  const messages: Record<ContainerActionType, string> = {
    stop: `Container "${containerName}" was stopped successfully.`,
    start: `Container "${containerName}" was started successfully.`,
    restart: `Container "${containerName}" was restarted successfully.`,
    delete: `Container "${containerName}", its image, mounted volumes, and networks were removed.`,
  };
  return messages[action];
}

export function getContainerActionErrorMessage(
  action: ContainerActionType,
  containerName: string,
): string {
  return `Could not ${action} "${containerName}". ${CONTAINER_ACTION_API_ERRORS[action]}`;
}
