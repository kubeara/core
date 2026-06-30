export const DEPLOYMENT_MESSAGES = {
  SERVER_DELETE_DEACTIVATED: "Deactivated because the server was deleted",
  SERVER_RESOURCE_VALIDATION_UNAVAILABLE:
    "Unable to validate server resources. The server may be offline or unreachable. Please try again.",
} as const;

export function isServerConnectivityValidationError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("no connected agent") ||
    normalized.includes("agent disconnected") ||
    normalized.includes("agent for server") ||
    normalized.includes("agent is installed") ||
    normalized.includes("agent is not connected") ||
    normalized.includes("cannot validate deployment resources") ||
    normalized.includes("deployment validation timed out")
  );
}
