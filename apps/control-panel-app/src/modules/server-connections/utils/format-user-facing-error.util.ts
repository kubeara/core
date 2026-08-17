/** Distinct user-facing server error messages (no duplicates). */
export const SERVER_USER_ERROR_MESSAGES = {
  /** Generic fallback for unknown or empty errors. */
  GENERIC_ERROR: "Something went wrong. Please try again.",
  CONNECTION_LOST: "Connection to this server was lost.",
  UNABLE_TO_CONNECT: "Unable to connect to this server.",
  SETUP_INCOMPLETE: "Server setup is incomplete.",
  RESTORING_CONNECTION: "Restoring the connection…",
  UNABLE_VERIFY_STATUS: "Unable to verify this server. Check SSH access.",
  UNABLE_RESTORE_CONNECTION:
    "Unable to restore the connection. Please try again.",
  SSH_AUTH_FAILED: "SSH authentication failed. Verify your credentials.",
  CONNECTION_TIMED_OUT: "Connection timed out.",
  UNABLE_REACH_SERVER:
    "Unable to reach this server. Check the address and network.",
  SUDO_REQUIRED: "This server user requires root or passwordless sudo access.",
  SETUP_FAILED: "Server setup could not be completed.",
  SETUP_CONFIGURATION_FAILED: "Unable to setup configuration.",
  DOCKER_UNAVAILABLE: "Docker is not available on this server.",
  SSH_CREDENTIALS_MISSING: "SSH credentials are missing. Add the server again.",
  UNABLE_REMOVE_SERVER: "Unable to remove this server.",
} as const;

const MSG = SERVER_USER_ERROR_MESSAGES;

const CONNECTION_PASS_THROUGH = new Set<string>(Object.values(MSG));

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Converts persisted or internal connection error text into a user-facing message.
 */
export function formatUserFacingAgentError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return MSG.GENERIC_ERROR;
  }

  if (CONNECTION_PASS_THROUGH.has(trimmed)) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();

  if (
    matchesAny(lower, [
      /permission denied/,
      /authentication failed/,
      /userauth failure/,
      /all configured authentication methods failed/,
    ])
  ) {
    return MSG.SSH_AUTH_FAILED;
  }

  if (matchesAny(lower, [/timed out/, /timeout/])) {
    return MSG.CONNECTION_TIMED_OUT;
  }

  if (
    matchesAny(lower, [
      /econnrefused/,
      /enotfound/,
      /unreachable/,
      /getaddrinfo/,
    ])
  ) {
    return MSG.UNABLE_REACH_SERVER;
  }

  if (
    matchesAny(lower, [
      /passwordless sudo/,
      /sudo: a password is required/,
      /cannot install packages/,
      /elevation: none/,
    ])
  ) {
    return MSG.SUDO_REQUIRED;
  }

  if (
    matchesAny(lower, [
      /agent container failed/,
      /compose up failed/,
      /docker compose up failed/,
      /agent install failed/,
      /agent setup failed/,
      /agent recovery failed/,
      /docker install failed/,
    ])
  ) {
    return MSG.SETUP_FAILED;
  }

  if (
    matchesAny(lower, [
      /ssh-in-docker/,
      /cannot run a local docker daemon/,
      /without a working local docker/,
      /docker still unavailable/,
      /docker compose/,
      /docker cli/,
      /docker daemon/,
      /dockerd/,
      /docker is not available/,
    ])
  ) {
    return MSG.DOCKER_UNAVAILABLE;
  }

  if (
    matchesAny(lower, [
      /prerequisite/,
      /agent-prereq/,
      /prerequisite script/,
      /pull agent image/,
      /no such image/,
      /manifest unknown/,
      /pull access denied/,
      /encryption_secret/,
      /control_panel_url/,
      /agent_socket_tunnel_port/,
      /misconfigured/,
    ])
  ) {
    return MSG.SETUP_CONFIGURATION_FAILED;
  }

  if (
    matchesAny(lower, [
      /ssh socket tunnel/,
      /reverse tunnel/,
      /self-host ssh/,
      /failed to open self-host/,
      /ssh connection test failed/,
      /ssh test failed/,
      /ssh connection failed/,
    ])
  ) {
    return MSG.UNABLE_TO_CONNECT;
  }

  if (
    matchesAny(lower, [
      /credentials not found/,
      /agent credentials missing/,
      /no ssh credentials/,
    ])
  ) {
    return MSG.SSH_CREDENTIALS_MISSING;
  }

  if (matchesAny(lower, [/websocket/, /web socket/, /not connected/])) {
    return MSG.CONNECTION_LOST;
  }

  if (
    lower.includes("kubeara-agent") ||
    lower.includes("docker logs") ||
    lower.includes(".env.agent")
  ) {
    return MSG.CONNECTION_LOST;
  }

  return MSG.GENERIC_ERROR;
}

/**
 * Converts persisted or internal server error text into a user-facing message.
 */
export function formatUserFacingServerError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return MSG.GENERIC_ERROR;
  }

  if (CONNECTION_PASS_THROUGH.has(trimmed)) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();

  if (
    matchesAny(lower, [
      /delete failed/,
      /deletion failed/,
      /failed to delete server/,
    ])
  ) {
    return MSG.UNABLE_REMOVE_SERVER;
  }

  if (
    matchesAny(lower, [
      /ssh connection failed/,
      /ssh connection test failed/,
      /ssh test failed/,
      /connection failed/,
    ])
  ) {
    return MSG.UNABLE_TO_CONNECT;
  }

  if (matchesAny(lower, [/connection timed out/, /timeout/])) {
    return MSG.CONNECTION_TIMED_OUT;
  }

  return MSG.GENERIC_ERROR;
}
