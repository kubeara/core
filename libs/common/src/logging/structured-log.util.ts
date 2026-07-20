import type { Logger } from "@nestjs/common";

/** Lifecycle phase for an operation log line. */
export type LogStatus =
  "started" | "succeeded" | "failed" | "skipped" | "timeout" | "retry";

/** Optional identifiers and metadata attached to every structured log. */
export interface LogContext {
  module?: string;
  serverId?: string;
  deploymentId?: string;
  sessionId?: string;
  containerId?: string;
  requestId?: string;
  userId?: string;
  socketId?: string;
  event?: string;
  template?: string;
  action?: string;
  status?: string;
  target?: string;
  room?: string;
  durationMs?: number;
  exitCode?: number | null;
  stdoutLen?: number;
  stderrLen?: number;
  command?: string;
  reason?: string;
  error?: string;
  [key: string]: string | number | boolean | null | undefined;
}

const RESERVED_KEYS = new Set(["operation", "status"]);

function appendContext(parts: string[], context?: LogContext): void {
  if (!context) {
    return;
  }
  for (const [key, value] of Object.entries(context)) {
    if (value == null || value === "" || RESERVED_KEYS.has(key)) {
      continue;
    }
    parts.push(`${key}=${formatContextValue(value)}`);
  }
}

function formatContextValue(value: string | number | boolean): string {
  const raw = String(value);
  if (/[\s="]/.test(raw)) {
    return `"${raw.replace(/"/g, '\\"')}"`;
  }
  return raw;
}

/**
 * Formats a human-readable structured log message: operation, status, then key=value context.
 */
export function formatStructuredLog(
  operation: string,
  status: LogStatus,
  context?: LogContext,
): string {
  const parts = [`operation=${operation}`, `status=${status}`];
  appendContext(parts, context);
  return parts.join(" ");
}

/**
 * Extracts message and stack from an unknown thrown value.
 */
export function extractErrorDetails(error: unknown): {
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

/**
 * Writes a structured operation log at the given NestJS logger level.
 */
export function logStructured(
  logger: Logger,
  level: "log" | "warn" | "error" | "debug" | "verbose",
  operation: string,
  status: LogStatus,
  context?: LogContext,
): void {
  logger[level](formatStructuredLog(operation, status, context));
}

/**
 * Writes a structured error log with root cause and optional stack trace.
 */
export function logStructuredError(
  logger: Logger,
  operation: string,
  error: unknown,
  context?: LogContext,
): void {
  const { message, stack } = extractErrorDetails(error);
  const line = formatStructuredLog(operation, "failed", {
    ...context,
    error: message,
  });
  if (stack && logger.error.length >= 2) {
    logger.error(line, stack);
  } else {
    logger.error(line);
  }
}

/** Redacts secrets and truncates long SSH commands for safe logging. */
export function sanitizeSshCommand(command: string, maxLen = 120): string {
  const redacted = command
    .replace(/(password|passwd|secret|token|key)=[^\s&;]+/gi, "$1=***")
    .replace(/\s+/g, " ")
    .trim();
  if (redacted.length <= maxLen) {
    return redacted;
  }
  return `${redacted.slice(0, maxLen)}…`;
}
