export const CONTAINER_LOGS_LABEL = "View logs";

export const CONTAINER_LOGS_STOP_CONFIRM_TITLE = "Stop log stream?";

export const CONTAINER_LOGS_STOP_CONFIRM_MESSAGE =
  "Live log streaming will end. You can restart it at any time.";

export const CONTAINER_LOGS_STOP_CONFIRM_BUTTON = "Stop";

export const CONTAINER_LOGS_LOADING_MESSAGE = "Connecting to container logs…";

export const CONTAINER_LOGS_EMPTY_MESSAGE = "No logs yet. Waiting for output…";

export const CONTAINER_LOGS_LIVE_LABEL = "Live";

export function getContainerLogsTitle(containerName: string): string {
  return `Logs — ${containerName}`;
}

export function mapContainerLogsErrorMessage(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("container not found")) {
    return "Container not found on this server.";
  }

  if (
    normalized.includes("no connected agent") ||
    normalized.includes("agent unavailable") ||
    normalized.includes("connect the agent")
  ) {
    return "Agent is disconnected. Connect the agent on this server to view logs.";
  }

  if (
    normalized.includes("docker is unavailable") ||
    normalized.includes("docker daemon")
  ) {
    return "Docker is unavailable on this server.";
  }

  if (normalized.includes("permission denied")) {
    return "Permission denied when accessing Docker logs.";
  }

  if (normalized.includes("exited with code 125")) {
    return "Log streaming failed. The container may be unavailable or Docker rejected the request.";
  }

  if (
    normalized.includes("timed out") ||
    normalized.includes("network") ||
    normalized.includes("socket")
  ) {
    return "Network error while streaming logs. Check your connection and try again.";
  }

  if (normalized.includes("log stream") || normalized.includes("streaming failed")) {
    return "Log streaming failed.";
  }

  return "Could not load container logs.";
}
