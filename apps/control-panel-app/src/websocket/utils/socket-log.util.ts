import type { Logger } from "@nestjs/common";
import { DeploymentEvents } from "@shared/socket-events";
import {
  formatStructuredLog,
  logStructured,
  logStructuredError,
  type LogContext,
  type LogStatus,
} from "@shared/common/logging/structured-log.util";

/** Socket lifecycle events worth logging at info level. */
export type SocketLifecyclePhase =
  | "client_connected"
  | "client_disconnected"
  | "room_joined"
  | "room_left"
  | "request_received"
  | "event_dispatched"
  | "event_acknowledged"
  | "timeout"
  | "error"
  | "retry";

/** Per-chunk socket events that must not be logged at info level. */
const HIGH_FREQUENCY_EVENTS = new Set<string>([
  DeploymentEvents.DEPLOYMENT_STREAM,
  DeploymentEvents.TERMINAL_OUTPUT,
  DeploymentEvents.TERMINAL_INPUT,
  DeploymentEvents.TERMINAL_RESIZE,
  DeploymentEvents.CONTAINER_LOGS_DATA,
]);

const LIFECYCLE_STATUS: Record<SocketLifecyclePhase, LogStatus> = {
  client_connected: "succeeded",
  client_disconnected: "succeeded",
  room_joined: "succeeded",
  room_left: "succeeded",
  request_received: "started",
  event_dispatched: "started",
  event_acknowledged: "succeeded",
  timeout: "timeout",
  error: "failed",
  retry: "retry",
};

export interface SocketLogContext extends LogContext {
  agentSocket?: string;
  totalAgents?: number;
  bytes?: number;
}

/**
 * Returns true when an outbound socket event should be logged at info level.
 * High-frequency stream/chunk events are excluded.
 */
export function shouldLogSocketEmit(event: string): boolean {
  return !HIGH_FREQUENCY_EVENTS.has(event);
}

/**
 * Logs an important socket lifecycle event with consistent structure.
 */
export function logSocketLifecycle(
  logger: Logger,
  phase: SocketLifecyclePhase,
  context?: SocketLogContext,
): void {
  logStructured(logger, "log", `socket.${phase}`, LIFECYCLE_STATUS[phase], {
    module: "DeploymentGateway",
    ...context,
  });
}

/**
 * Logs an outbound socket emit only for non-high-frequency lifecycle events.
 */
export function logSocketEmit(
  logger: Logger,
  event: string,
  context?: SocketLogContext,
): void {
  if (!shouldLogSocketEmit(event)) {
    return;
  }
  logStructured(logger, "log", "socket.event_dispatched", "started", {
    module: "DeploymentGateway",
    event,
    ...context,
  });
}

/**
 * Logs a socket RPC timeout with request context.
 */
export function logSocketTimeout(
  logger: Logger,
  operation: string,
  context?: SocketLogContext,
): void {
  logStructured(logger, "warn", operation, "timeout", {
    module: "DeploymentGateway",
    ...context,
  });
}

/**
 * Logs a socket handler error with structured context.
 */
export function logSocketError(
  logger: Logger,
  operation: string,
  error: unknown,
  context?: SocketLogContext,
): void {
  logStructuredError(logger, operation, error, {
    module: "DeploymentGateway",
    ...context,
  });
}

/**
 * Formats a socket lifecycle line (for debug-only stream diagnostics).
 */
export function formatSocketDebug(
  context: string,
  extra?: Record<string, unknown>,
): string {
  return formatStructuredLog("socket.stream_diag", "started", {
    module: "DeploymentGateway",
    context,
    ...extraFields(extra),
  });
}

function extraFields(extra?: Record<string, unknown>): LogContext {
  const fields: LogContext = {};
  if (!extra) {
    return fields;
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value != null && typeof value !== "object") {
      fields[key] = value as string | number | boolean;
    }
  }
  return fields;
}
