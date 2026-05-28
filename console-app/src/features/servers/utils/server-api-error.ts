import { ApiError, extractMessageFromBody, toApiError } from "@/api/api-error";

export function assertApiSuccess(
  responseBody: Record<string, unknown>,
  fallbackMessage: string,
): void {
  if (responseBody.success === false) {
    throw new ApiError(
      extractMessageFromBody(responseBody) ?? fallbackMessage,
      typeof responseBody.statusCode === "number" ? responseBody.statusCode : 400,
      responseBody,
    );
  }
}

export async function runServerApiCall<T>(
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw toApiError(error);
  }
}

function isSuccessfulHttpStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

export function unwrapServerApiData<T>(
  responseBody: Record<string, unknown>,
  fallbackMessage: string,
): T {
  assertApiSuccess(responseBody, fallbackMessage);

  const envelopeStatus =
    typeof responseBody.statusCode === "number" ? responseBody.statusCode : null;
  if (envelopeStatus !== null && !isSuccessfulHttpStatus(envelopeStatus)) {
    throw new ApiError(
      extractMessageFromBody(responseBody) ?? fallbackMessage,
      envelopeStatus,
      responseBody,
    );
  }

  if (responseBody.data === undefined) {
    throw new ApiError(
      extractMessageFromBody(responseBody) ?? fallbackMessage,
      typeof responseBody.statusCode === "number"
        ? responseBody.statusCode
        : 500,
      responseBody,
    );
  }

  return responseBody.data as T;
}

export function extractApiMessage(
  responseBody: Record<string, unknown>,
  fallbackMessage: string,
): string {
  return typeof responseBody.message === "string" && responseBody.message.trim()
    ? responseBody.message.trim()
    : fallbackMessage;
}
