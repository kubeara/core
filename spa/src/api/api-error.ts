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

/**
 * Extract a human-readable error message from various error types.
 * 
 * Handles:
 * - Axios errors with response data
 * - Standard Error objects
 * - Unknown error types
 * 
 * @param error - The error to extract a message from
 * @returns A human-readable error message
 * 
 * @example
 * try {
 *   await apiClient.post('/auth/login', data);
 * } catch (error) {
 *   const message = getErrorMessage(error);
 *   console.error(message); // "Invalid credentials"
 * }
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof AxiosError) {
        const data = error.response?.data as Record<string, unknown> | undefined;

        // Try to extract message from common response formats
        if (typeof data?.message === "string") {
            return data.message;
        }
        if (typeof data?.error === "string") {
            return data.error;
        }

        // Fall back to Axios error message
        return error.message || "Request failed";
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "An unexpected error occurred";
}

/**
 * Convert any error type to a structured ApiError instance.
 * 
 * This is useful for consistent error handling in mutation hooks.
 * 
 * @param error - The error to convert
 * @returns An ApiError instance with status and body information
 * 
 * @example
 * export function useLoginMutation() {
 *   return useMutation({
 *     mutationFn: login,
 *     onError: (error) => {
 *       const apiError = toApiError(error);
 *       if (apiError.status === 401) {
 *         console.error('Invalid credentials');
 *       }
 *     },
 *   });
 * }
 */
export function toApiError(error: unknown): ApiError {
    if (error instanceof AxiosError) {
        const status = error.response?.status ?? 500;
        const data = (error.response?.data ?? {}) as Record<string, unknown>;
        const message = getErrorMessage(error);
        return new ApiError(message, status, data);
    }

    if (error instanceof ApiError) {
        return error;
    }

    return new ApiError(getErrorMessage(error), 500);
}
