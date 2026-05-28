import axios from "axios";
import {
    ACCESS_TOKEN_KEY,
    AUTH_ENDPOINTS_WITHOUT_REFRESH,
    REFRESH_TOKEN_KEY,
} from "../constants";
import type { RefreshTokenResponse } from "../types";
import {
    clearStoredTokens,
    getStoredAccessToken,
    getStoredRefreshToken,
    storeAccessToken,
    storeRefreshToken,
} from "./token-storage";

type ApiSuccessResponse<T> = {
    success?: boolean;
    statusCode?: number;
    message: string;
    data?: T;
};

let accessToken: string | null = getStoredAccessToken();
let refreshToken: string | null = getStoredRefreshToken();

let refreshPromise: Promise<boolean> | null = null;
let initPromise: Promise<boolean> | null = null;
const tokenChangeListeners = new Set<() => void>();

function notifyTokenChanges(): void {
    for (const listener of tokenChangeListeners) {
        listener();
    }
}

function getApiBaseUrl(): string {
    const base = import.meta.env.VITE_API_URL?.trim() ?? "";
    return base.replace(/\/$/, "");
}

function buildAuthUrl(path: string): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const base = getApiBaseUrl();
    return base ? `${base}${normalized}` : normalized;
}

function unwrapTokenPayload(
    responseData: unknown,
): RefreshTokenResponse | null {
    if (!responseData || typeof responseData !== "object") {
        return null;
    }

    const payload = responseData as ApiSuccessResponse<RefreshTokenResponse>;
    const tokens = payload.data;

    if (tokens?.accessToken && tokens?.refreshToken) {
        return tokens;
    }

    return null;
}

export function getAccessToken(): string | null {
    return accessToken;
}

export function getRefreshToken(): string | null {
    return refreshToken;
}

export function hasStoredSession(): boolean {
    return getStoredAccessToken() !== null;
}

export function setTokens(access: string, refresh: string): void {
    accessToken = access;
    refreshToken = refresh;
    storeAccessToken(access);
    storeRefreshToken(refresh);
    notifyTokenChanges();
}

export function clearTokens(): void {
    accessToken = null;
    refreshToken = null;
    clearStoredTokens();
    initPromise = null;
    notifyTokenChanges();
}

export function hydrateTokensFromStorage(): void {
    accessToken = getStoredAccessToken();
    refreshToken = getStoredRefreshToken();
}

export function shouldSkipRefreshForUrl(url: string | undefined): boolean {
    if (!url) {
        return false;
    }

    return AUTH_ENDPOINTS_WITHOUT_REFRESH.some((endpoint) =>
        url.includes(endpoint),
    );
}

async function requestTokenRefresh(token: string): Promise<RefreshTokenResponse | null> {
    const response = await axios.post<ApiSuccessResponse<RefreshTokenResponse>>(
        buildAuthUrl("/auth/refresh-token"),
        { refreshToken: token },
    );

    return unwrapTokenPayload(response.data);
}

/**
 * Refresh access/refresh tokens using the current refresh token.
 * Concurrent callers share the same in-flight request.
 */
export async function refreshTokens(): Promise<boolean> {
    const token = refreshToken ?? getStoredRefreshToken();
    if (!token) {
        return false;
    }

    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            const tokens = await requestTokenRefresh(token);
            if (!tokens) {
                clearTokens();
                return false;
            }

            setTokens(tokens.accessToken, tokens.refreshToken);
            return true;
        } catch {
            clearTokens();
            return false;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

/**
 * Restore persisted tokens on app startup.
 * Safe to call multiple times — callers share the same initialization promise.
 */
export async function initializeAuthSession(): Promise<boolean> {
    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        hydrateTokensFromStorage();
        return hasStoredSession();
    })();

    return initPromise;
}

export function subscribeToTokenChanges(onTokensChanged: () => void): () => void {
    tokenChangeListeners.add(onTokensChanged);
    return () => {
        tokenChangeListeners.delete(onTokensChanged);
    };
}

export function subscribeToTokenStorageChanges(
    onTokensChanged: () => void,
): () => void {
    if (typeof window === "undefined") {
        return () => undefined;
    }

    function handleStorage(event: StorageEvent): void {
        if (event.key !== ACCESS_TOKEN_KEY && event.key !== REFRESH_TOKEN_KEY) {
            return;
        }

        hydrateTokensFromStorage();
        onTokensChanged();
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
}
