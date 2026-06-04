import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import { ApiError, extractMessageFromBody } from "@/api/api-error";
import {
    clearTokens,
    getAccessToken,
    initializeAuthSession,
    setTokens,
} from "@/features/auth/utils/token-manager";
import { getStoredAccessToken } from "@/features/auth/utils/token-storage";
import { getApiBaseUrl } from "@/lib/api-config";

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

export function buildApiUrl(path: string): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const base = getApiBaseUrl();
    return base ? `${base}${normalized}` : normalized;
}

export function buildDeploymentsSocketUrl(): string {
    const explicitWs = import.meta.env.VITE_WS_URL?.trim();
    if (explicitWs) {
        return explicitWs.replace(/\/$/, "");
    }

    // Dev: use the Vite origin so /socket.io is proxied to the control panel.
    if (import.meta.env.DEV && typeof window !== "undefined") {
        return `${window.location.origin}/deployments`;
    }

    const base = getApiBaseUrl().replace(/\/api\/?$/, "");
    if (base) {
        return `${base}/deployments`;
    }

    return `${window.location.origin}/deployments`;
}

function createApiClient(): AxiosInstance {
    const client = axios.create({
        headers: {
            "Content-Type": "application/json",
        },
    });

    client.setTokens = setTokens;
    client.clearTokens = clearTokens;
    client.getAccessToken = getAccessToken;

    client.interceptors.request.use((config) => {
        const baseURL = getApiBaseUrl();
        if (baseURL) {
            config.baseURL = baseURL;
        }
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
