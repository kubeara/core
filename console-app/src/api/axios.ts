import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import { ApiError, extractMessageFromBody } from "@/api/api-error";
import {
    clearTokens,
    getAccessToken,
    initializeAuthSession,
    setTokens,
} from "@/features/auth/utils/token-manager";
import { getStoredAccessToken } from "@/features/auth/utils/token-storage";

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
}

function rejectEnvelopeFailure(response: AxiosResponse): AxiosResponse {
    const data = response.data;
    if (!isRecord(data) || data.success !== false) {
        return response;
    }

    const status =
        typeof data.statusCode === "number" ? data.statusCode : response.status;
    const message =
        extractMessageFromBody(data) ?? "Request failed";

    throw new ApiError(message, status, data);
}

function getApiBaseUrl(): string {
    const base = import.meta.env.VITE_API_URL?.trim() ?? "";
    return base.replace(/\/$/, "");
}

export function buildApiUrl(path: string): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const base = getApiBaseUrl();
    return base ? `${base}${normalized}` : normalized;
}

function createApiClient(): AxiosInstance {
    const client = axios.create({
        baseURL: getApiBaseUrl(),
        headers: {
            "Content-Type": "application/json",
        },
    });

    client.setTokens = setTokens;
    client.clearTokens = clearTokens;
    client.getAccessToken = getAccessToken;

    client.interceptors.request.use((config) => {
        const token = getAccessToken() ?? getStoredAccessToken();
        if (token) {
            config.headers.set("Authorization", `Bearer ${token}`);
        }
        return config;
    });

    client.interceptors.response.use(
        (response) => rejectEnvelopeFailure(response),
        (error: AxiosError) => Promise.reject(error),
    );

    return client;
}

export const apiClient = createApiClient();

/**
 * Restore persisted tokens before routing decisions.
 */
export async function initializeAuth(): Promise<boolean> {
    return initializeAuthSession();
}

declare module "axios" {
    interface AxiosInstance {
        setTokens(access: string, refresh: string): void;
        clearTokens(): void;
        getAccessToken(): string | null;
    }
}
