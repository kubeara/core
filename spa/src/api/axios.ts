import axios, { AxiosError, AxiosInstance } from "axios";
import {
    clearTokens,
    getAccessToken,
    initializeAuthSession,
    setTokens,
} from "@/features/auth/utils/token-manager";
import { getStoredAccessToken } from "@/features/auth/utils/token-storage";

function getApiBaseUrl(): string {
    const runtime = window.__KUBEARA_CONFIG__?.VITE_API_URL?.trim();
    const buildTime = import.meta.env.VITE_API_URL?.trim();
    const base = runtime || buildTime || "";
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
        (response) => response,
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
