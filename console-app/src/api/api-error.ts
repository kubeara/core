import { AxiosError } from "axios";

/**
 * Custom error class for API-related errors.
 * Provides structured error information including HTTP status and response body.
 */
export class ApiError extends Error {
    /** HTTP status code (e.g., 400, 401, 500) */
    status: number;

    /** Response body from the API */
    body: Record<string, unknown>;

    /**
     * Create a new API error.
     *
     * @param message - Human-readable error message
     * @param status - HTTP status code
     * @param body - Response body from the API
     */
    constructor(
        message: string,
        status: number,
        body: Record<string, unknown> = {},
    ) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
}

/**
 * Extract a human-readable message from a backend error response body.
 */
export function extractMessageFromBody(
    data: Record<string, unknown> | undefined,
): string | null {
    if (!data) {
        return null;
    }

    if (data.success === false) {
        const failureMessage =
            typeof data.message === "string" && data.message.trim()
                ? data.message.trim()
                : null;
        const failureError =
            typeof data.error === "string" && data.error.trim()
                ? data.error.trim()
                : null;

        if (failureMessage && failureError && failureMessage !== failureError) {
            return failureMessage;
        }

        return failureMessage ?? failureError;
    }

    const messageField = data.message;
    if (typeof messageField === "string" && messageField.trim()) {
        return messageField.trim();
    }

    if (Array.isArray(messageField)) {
        const messages = messageField.filter(
            (entry): entry is string =>
                typeof entry === "string" && entry.trim().length > 0,
        );
        if (messages.length > 0) {
            return messages.join(", ");
        }
    }

    if (typeof data.error === "string" && data.error.trim()) {
        return data.error.trim();
    }

    const nestedData = data.data;
    if (isRecord(nestedData)) {
        if (typeof nestedData.error === "string" && nestedData.error.trim()) {
            return nestedData.error.trim();
        }
        if (
            typeof nestedData.message === "string" &&
            nestedData.message.trim()
        ) {
            return nestedData.message.trim();
        }
    }

    return null;
}

/**
 * Extract a human-readable error message from various error types.
 *
 * Handles:
 * - ApiError instances
 * - Axios errors with response data (including validation arrays)
 * - Network failures
 * - Standard Error objects
 * - Unknown error types
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        return error.message;
    }

    if (error instanceof AxiosError) {
        if (!error.response) {
            if (error.code === "ERR_CANCELED") {
                return "Request was canceled.";
            }
            return "Network error. Please check your connection and try again.";
        }

        const extracted = extractMessageFromBody(
            error.response.data as Record<string, unknown> | undefined,
        );
        if (extracted) {
            return extracted;
        }

        if (error.response.status === 401) {
            return "Your session has expired. Please sign in again.";
        }

        if (error.response.status === 403) {
            return "You do not have permission to perform this action.";
        }

        return error.message || "Request failed";
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "An unexpected error occurred";
}

/**
 * Convert any error type to a structured ApiError instance.
 */
export function toApiError(error: unknown): ApiError {
    if (error instanceof ApiError) {
        return error;
    }

    if (error instanceof AxiosError) {
        const status = error.response?.status ?? 500;
        const data = isRecord(error.response?.data)
            ? error.response.data
            : {};
        const message = getErrorMessage(error);
        return new ApiError(message, status, data);
    }

    if (error instanceof Error) {
        return new ApiError(error.message, 500);
    }

    return new ApiError(getErrorMessage(error), 500);
}
