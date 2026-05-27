import { HttpStatus } from "@nestjs/common";
import { OperationFailedException } from "../exceptions/operation-failed.exception";

type FailurePayload = {
  success: false;
  message?: string;
  error?: string;
  code?: string;
  errorCode?: string;
};

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Converts legacy `{ success: false }` payloads into HTTP exceptions.
 */
export function throwIfFailurePayload(value: unknown): void {
  if (
    value === null ||
    typeof value !== "object" ||
    (value as FailurePayload).success !== false
  ) {
    return;
  }

  const payload = value as FailurePayload;
  const error = nonEmptyString(payload.error);
  const message = nonEmptyString(payload.message) ?? "Operation failed";
  const errorCode =
    nonEmptyString(payload.errorCode) ?? nonEmptyString(payload.code);

  throw new OperationFailedException(
    message,
    error ?? nonEmptyString(payload.message) ?? "Operation failed",
    HttpStatus.BAD_REQUEST,
    errorCode ? { errorCode } : undefined,
  );
}
