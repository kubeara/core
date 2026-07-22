/**
 * Normalizes an unknown thrown value into a log-safe error message.
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export {
  extractErrorDetails,
  formatStructuredLog,
  logStructured,
  logStructuredError,
  sanitizeSshCommand,
  type LogContext,
  type LogStatus,
} from "@shared/common";
