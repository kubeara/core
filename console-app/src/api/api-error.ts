import { AxiosError } from "axios";
import { API_ERROR_MESSAGES } from "@/constants/error-messages";
import { normalizeValidationMessage, normalizeValidationMessages } from "@/lib/validation";

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

function isServerErrorStatus(status: number): boolean {
    return status >= 500;
}

const TECHNICAL_MESSAGE_PATTERNS = [
    /typeorm/i,
    /queryfailederror/i,
    /econnrefused/i,
    /etimedout/i,
    /enotfound/i,
    /getaddrinfo/i,
    /socket hang up/i,
    /cannot connect to/i,
    /connection refused/i,
    /prisma/i,
    /sequelize/i,
    /mongodb/i,
    /postgres/i,
    /syntax error at/i,
    /internal server error/i,
    /request failed with status code 5\d\d/i,
    /\n\s+at\s+/,
    /unhandled\s+rejection/i,
];

function looksTechnical(message: string): boolean {
    const trimmed = message.trim();
    if (!trimmed) {
        return false;
    }

    return TECHNICAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function sanitizeForDisplay(message: string): string {
    const normalized = normalizeValidationMessage(message);

    if (looksTechnical(normalized)) {
        return API_ERROR_MESSAGES.GENERIC;
    }

    return normalized;
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
        return normalizeValidationMessage(messageField.trim());
    }

    if (Array.isArray(messageField)) {
        const messages = messageField.filter(
            (entry): entry is string =>
                typeof entry === "string" && entry.trim().length > 0,
        );
        if (messages.length > 0) {
            return normalizeValidationMessages(messages.join(", "));
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
 * Reads retryAfterSeconds from a rate-limit (429) response body.
 */
export function extractRetryAfterSeconds(
    data: Record<string, unknown> | undefined,
): number | null {
    if (!data) {
        return null;
    }

    const value = data.retryAfterSeconds;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.ceil(value);
    }

    return null;
}

/**
 * Extract a user-facing error message from various error types.
 *
 * Technical or infrastructure failures return a generic message.
 * Intentional backend messages (including structured 5xx responses) are shown.
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        const fromBody = extractMessageFromBody(error.body);
        if (fromBody) {
            return sanitizeForDisplay(fromBody);
        }
        return sanitizeForDisplay(error.message);
    }

    if (error instanceof AxiosError) {
        if (!error.response) {
            if (error.code === "ERR_CANCELED") {
                return API_ERROR_MESSAGES.REQUEST_CANCELED;
            }
            return API_ERROR_MESSAGES.NETWORK;
        }

        const status = error.response.status;
        const extracted = extractMessageFromBody(
            error.response.data as Record<string, unknown> | undefined,
        );
        if (extracted) {
            const sanitized = sanitizeForDisplay(extracted);
            if (sanitized !== API_ERROR_MESSAGES.GENERIC) {
                return sanitized;
            }
        }

        if (isServerErrorStatus(status)) {
            return API_ERROR_MESSAGES.GENERIC;
        }

        if (status === 401) {
            return API_ERROR_MESSAGES.SESSION_EXPIRED;
        }

        if (status === 403) {
            return API_ERROR_MESSAGES.FORBIDDEN;
        }

        if (status === 429) {
            return API_ERROR_MESSAGES.TOO_MANY_REQUESTS;
        }

        return error.message || API_ERROR_MESSAGES.REQUEST_FAILED;
    }

    if (error instanceof Error) {
        return sanitizeForDisplay(error.message);
    }

    return API_ERROR_MESSAGES.GENERIC;
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
        return new ApiError(getErrorMessage(error), 500);
    }

    return new ApiError(getErrorMessage(error), 500);
}
