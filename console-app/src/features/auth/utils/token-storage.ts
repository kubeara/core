import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../constants";

export function storeAccessToken(accessToken: string): void {
    try {
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    } catch (error) {
        console.error("Failed to store access token:", error);
    }
}

export function getStoredAccessToken(): string | null {
    try {
        return localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch (error) {
        console.error("Failed to retrieve access token:", error);
        return null;
    }
}

export function clearStoredAccessToken(): void {
    try {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch (error) {
        console.error("Failed to clear access token:", error);
    }
}

export function storeRefreshToken(refreshToken: string): void {
    try {
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } catch (error) {
        console.error("Failed to store refresh token:", error);
    }
}

export function getStoredRefreshToken(): string | null {
    try {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch (error) {
        console.error("Failed to retrieve refresh token:", error);
        return null;
    }
}

export function clearStoredRefreshToken(): void {
    try {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch (error) {
        console.error("Failed to clear refresh token:", error);
    }
}

export function clearStoredTokens(): void {
    clearStoredAccessToken();
    clearStoredRefreshToken();
}

export function hasStoredTokens(): boolean {
    return getStoredAccessToken() !== null || getStoredRefreshToken() !== null;
}
