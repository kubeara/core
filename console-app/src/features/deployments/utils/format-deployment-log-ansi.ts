import type { DeploymentLogStreamType } from "@/constants/deployment-events";

const ANSI_RESET = "\x1b[0m";
const ANSI_ERROR = "\x1b[38;5;203m";
const ANSI_SUCCESS = "\x1b[38;5;78m";
const ANSI_INFO = "\x1b[38;5;117m";

const DOCKER_PROGRESS_RE =
  /\b(Creating|Starting|Pulling|Waiting|Removing|Building|Recreating|Downloading|Extracting|Verifying|Preparing|Restarting)\b/i;

const DOCKER_SUCCESS_RE =
  /\b(Created|Started|Pulled|Healthy|Complete|Removed|Recreated|Built|Done)\b/i;

const DEPLOYMENT_ERROR_RE =
  /\b(error|failed|failure|fatal|denied|cannot|unable|panic)\b|exited with code [1-9]\d*/i;

/**
 * Docker Compose writes normal progress (Creating, Started, etc.) to stderr.
 * Color by message meaning, not raw stream type.
 */
export function formatDeploymentLogAnsi(
  message: string,
  stream: DeploymentLogStreamType,
): string {
  if (DEPLOYMENT_ERROR_RE.test(message)) {
    return `${ANSI_ERROR}${message}${ANSI_RESET}`;
  }

  if (DOCKER_SUCCESS_RE.test(message)) {
    return `${ANSI_SUCCESS}${message}${ANSI_RESET}`;
  }

  if (DOCKER_PROGRESS_RE.test(message)) {
    return `${ANSI_INFO}${message}${ANSI_RESET}`;
  }

  if (stream === "stderr") {
    return `${ANSI_ERROR}${message}${ANSI_RESET}`;
  }

  return message;
}
