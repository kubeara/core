/** Canonical user-facing server connection error messages. */
export const SERVER_USER_ERROR_MESSAGES = {
  NOT_CONNECTED: "This server is not connected to Kubeara.",
  NOT_RUNNING: "The server service is not running.",
  SETUP_INCOMPLETE: "Server setup has not completed yet.",
  RESTORING_CONNECTION: "Restoring the connection…",
  UNABLE_VERIFY_STATUS: "Unable to verify server status. Check SSH access.",
  UNABLE_RESTORE_CONNECTION:
    "Unable to restore the connection. Please try again.",
  UNABLE_ESTABLISH_CONNECTION:
    "Unable to establish a connection. Please try again.",
  SSH_AUTH_FAILED: "SSH authentication failed. Verify your credentials.",
  CONNECTION_TIMED_OUT: "Connection timed out. Check the host and network.",
  UNABLE_REACH_SERVER:
    "Unable to reach this server. Check the address and network.",
  SUDO_REQUIRED: "This server user requires root or passwordless sudo access.",
  SETUP_START_FAILED: "Server setup could not be started.",
  DOCKER_UNAVAILABLE: "Docker is not available on this server.",
  SETUP_PREREQUISITES_FAILED: "Server setup requirements were not met.",
  SOFTWARE_DOWNLOAD_FAILED: "Unable to download required software.",
  UNABLE_CONNECT_KUBEARA: "This server could not connect to Kubeara.",
  KUBEARA_MISCONFIGURED:
    "Kubeara is misconfigured. Contact your administrator.",
  DOCKER_NOT_SUPPORTED: "This host cannot run Docker.",
  SSH_CREDENTIALS_MISSING: "SSH credentials are missing. Add the server again.",
  SETUP_FAILED: "Server setup could not be completed.",
  UNABLE_REMOVE_SERVER: "Unable to remove this server. Please try again.",
  UNABLE_CONNECT_SSH: "Unable to connect to this server. Verify SSH access.",
  OPERATION_FAILED: "The operation could not be completed. Please try again.",
} as const;

const MSG = SERVER_USER_ERROR_MESSAGES;

const CONNECTION_PASS_THROUGH = new Set<string>(Object.values(MSG));

/** Maps previously persisted messages to the current canonical copy. */
const LEGACY_MESSAGE_MAP: Record<string, string> = {
  "Agent is running but not connected.": MSG.NOT_CONNECTED,
  "Agent is not running.": MSG.NOT_RUNNING,
  "Agent is not installed.": MSG.SETUP_INCOMPLETE,
  "Reconnecting agent…": MSG.RESTORING_CONNECTION,
  "Reconnecting…": MSG.RESTORING_CONNECTION,
  "Could not verify agent status.": MSG.UNABLE_VERIFY_STATUS,
  "Could not verify server status.": MSG.UNABLE_VERIFY_STATUS,
  "Could not reconnect agent.": MSG.UNABLE_RESTORE_CONNECTION,
  "Could not reconnect.": MSG.UNABLE_RESTORE_CONNECTION,
  "Agent connection failed.": MSG.UNABLE_ESTABLISH_CONNECTION,
  "Connection failed.": MSG.UNABLE_ESTABLISH_CONNECTION,
  "Agent setup failed.": MSG.SETUP_FAILED,
  "Setup failed.": MSG.SETUP_FAILED,
  "Agent failed to start on the server.": MSG.SETUP_START_FAILED,
  "Setup failed to start.": MSG.SETUP_START_FAILED,
  "Agent setup prerequisites failed.": MSG.SETUP_PREREQUISITES_FAILED,
  "Setup prerequisites failed.": MSG.SETUP_PREREQUISITES_FAILED,
  "Could not download the agent image.": MSG.SOFTWARE_DOWNLOAD_FAILED,
  "Could not download required software.": MSG.SOFTWARE_DOWNLOAD_FAILED,
  "Could not connect the agent to Kubeara.": MSG.UNABLE_CONNECT_KUBEARA,
  "Could not connect to Kubeara.": MSG.UNABLE_CONNECT_KUBEARA,
  "Agent is not connected.": MSG.NOT_CONNECTED,
  "Server is not connected.": MSG.NOT_CONNECTED,
  "Server is not running.": MSG.NOT_RUNNING,
  "Setup incomplete.": MSG.SETUP_INCOMPLETE,
  "SSH authentication failed. Check your credentials.": MSG.SSH_AUTH_FAILED,
  "Connection timed out. Check the host and network.": MSG.CONNECTION_TIMED_OUT,
  "Could not reach the server.": MSG.UNABLE_REACH_SERVER,
  "Server user needs root or passwordless sudo.": MSG.SUDO_REQUIRED,
  "Docker is not available on the server.": MSG.DOCKER_UNAVAILABLE,
  "Kubeara is misconfigured. Contact your administrator.":
    MSG.KUBEARA_MISCONFIGURED,
  "This server cannot run Docker. Use a machine with Docker installed.":
    MSG.DOCKER_NOT_SUPPORTED,
  "SSH credentials are missing. Re-add the server.":
    MSG.SSH_CREDENTIALS_MISSING,
  "Could not remove the server.": MSG.UNABLE_REMOVE_SERVER,
  "Could not connect to the server.": MSG.UNABLE_CONNECT_SSH,
  "Connection timed out.": MSG.CONNECTION_TIMED_OUT,
  "Server operation failed.": MSG.OPERATION_FAILED,
};

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Converts persisted or internal connection error text into a user-facing message.
 */
export function formatUserFacingAgentError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return MSG.UNABLE_ESTABLISH_CONNECTION;
  }

  const legacy = LEGACY_MESSAGE_MAP[trimmed];
  if (legacy) {
    return legacy;
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
    ])
  ) {
    return MSG.SETUP_START_FAILED;
  }

  if (
    matchesAny(lower, [
      /docker compose/,
      /docker cli/,
      /docker daemon/,
      /dockerd/,
      /docker is not available/,
    ])
  ) {
    return MSG.DOCKER_UNAVAILABLE;
  }

  if (matchesAny(lower, [/prerequisite/, /agent-prereq/])) {
    return MSG.SETUP_PREREQUISITES_FAILED;
  }

  if (
    matchesAny(lower, [
      /pull agent image/,
      /no such image/,
      /manifest unknown/,
      /pull access denied/,
    ])
  ) {
    return MSG.SOFTWARE_DOWNLOAD_FAILED;
  }

  if (
    matchesAny(lower, [
      /ssh socket tunnel/,
      /reverse tunnel/,
      /self-host ssh/,
      /failed to open self-host/,
    ])
  ) {
    return MSG.UNABLE_CONNECT_KUBEARA;
  }

  if (
    matchesAny(lower, [
      /encryption_secret/,
      /control_panel_url/,
      /agent_socket_tunnel_port/,
      /misconfigured/,
    ])
  ) {
    return MSG.KUBEARA_MISCONFIGURED;
  }

  if (
    matchesAny(lower, [
      /ssh-in-docker/,
      /cannot run a local docker daemon/,
      /without a working local docker/,
    ])
  ) {
    return MSG.DOCKER_NOT_SUPPORTED;
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

  if (
    matchesAny(lower, [
      /agent install failed/,
      /agent setup failed/,
      /agent recovery failed/,
      /docker install failed/,
    ])
  ) {
    return MSG.SETUP_FAILED;
  }

  if (matchesAny(lower, [/websocket/, /web socket/, /not connected/])) {
    return MSG.NOT_CONNECTED;
  }

  if (
    lower.includes("kubeara-agent") ||
    lower.includes("docker logs") ||
    lower.includes(".env.agent")
  ) {
    return MSG.NOT_CONNECTED;
  }

  if (lower.includes("agent")) {
    return MSG.UNABLE_ESTABLISH_CONNECTION;
  }

  return MSG.UNABLE_ESTABLISH_CONNECTION;
}

/**
 * Converts persisted or internal server error text into a user-facing message.
 */
export function formatUserFacingServerError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return MSG.OPERATION_FAILED;
  }

  const legacy = LEGACY_MESSAGE_MAP[trimmed];
  if (legacy) {
    return legacy;
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
    return MSG.UNABLE_CONNECT_SSH;
  }

  if (matchesAny(lower, [/connection timed out/, /timeout/])) {
    return MSG.CONNECTION_TIMED_OUT;
  }

  return MSG.OPERATION_FAILED;
}
