/**
 * Returns the primary human-readable error for a server, if any.
 * Connection errors take precedence over server-level errors.
 */
export function getServerDisplayError(server: {
  agentError?: string | null;
  serverError?: string | null;
}): string | null {
  const agentError = server.agentError?.trim();
  if (agentError) {
    return agentError;
  }

  const serverError = server.serverError?.trim();
  return serverError ? serverError : null;
}

/**
 * True when the server has a persisted connection or server error to show.
 */
export function hasServerDisplayError(server: {
  agentError?: string | null;
  serverError?: string | null;
}): boolean {
  return getServerDisplayError(server) !== null;
}
