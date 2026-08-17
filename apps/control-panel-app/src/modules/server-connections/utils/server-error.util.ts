import {
  ServerAgentError,
  ServerHealthError,
} from "../interfaces/server-health.interface";
import {
  formatUserFacingAgentError,
  formatUserFacingServerError,
} from "./format-user-facing-error.util";

/**
 * Returns a trimmed human-readable message from a persisted serverError column.
 */
export function extractServerErrorMessage(
  error: ServerHealthError | null | undefined,
): string | null {
  const message = error?.message?.trim();
  return message ? formatUserFacingServerError(message) : null;
}

/**
 * Returns a trimmed human-readable message from a persisted agentError column.
 */
export function extractAgentErrorMessage(
  error: ServerAgentError | null | undefined,
): string | null {
  const message = error?.message?.trim();
  return message ? formatUserFacingAgentError(message) : null;
}

/**
 * Builds a serverError jsonb payload for persistence.
 */
export function buildServerHealthError(message: string): ServerHealthError {
  return {
    message: formatUserFacingServerError(message),
    checkedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Builds an agentError jsonb payload for persistence.
 */
export function buildServerAgentError(params: {
  message: string;
  serverId: string;
  host: string;
  retryCount?: number;
  recoveryInProgress?: boolean;
}): ServerAgentError {
  return {
    message: formatUserFacingAgentError(params.message),
    serverId: params.serverId,
    host: params.host,
    checkedAt: Math.floor(Date.now() / 1000),
    retryCount: params.retryCount ?? 0,
    ...(params.recoveryInProgress ? { recoveryInProgress: true } : {}),
  };
}
