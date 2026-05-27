import { HttpStatus } from "@nestjs/common";
import { OperationFailedException } from "../exceptions/operation-failed.exception";

type FailurePayload = {
  success: false;
  message?: string;
  error?: string;
  code?: string;
  errorCode?: string;
  step?: string;
  logs?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function isFailurePayload(value: unknown): value is FailurePayload {
  return isRecord(value) && value.success === false;
}

function resolveFailureMessage(payload: FailurePayload): string {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return "Operation failed";
  }

  return "Operation failed";
}

function resolveFailureError(payload: FailurePayload): string {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  return "Operation failed";
}

/**
 * Converts legacy `{ success: false }` payloads into HTTP exceptions.
 */
export function throwIfFailurePayload(value: unknown): void {
  if (!isFailurePayload(value)) {
    return;
  }

  const errorCode =
    typeof value.code === "string"
      ? value.code
      : typeof value.errorCode === "string"
        ? value.errorCode
        : undefined;

  throw new OperationFailedException(
    resolveFailureMessage(value),
    resolveFailureError(value),
    HttpStatus.BAD_REQUEST,
    {
      errorCode,
      step: typeof value.step === "string" ? value.step : undefined,
      logs: Array.isArray(value.logs)
        ? value.logs.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : undefined,
    },
  );
}
