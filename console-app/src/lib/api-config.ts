/**
 * API base URL for the control panel (includes Nest global prefix `/api`).
 * Docker/production: set via /env.js (window.__KUBEARA_CONFIG__.VITE_API_URL).
 * Local dev: set VITE_API_URL in console-app/.env (e.g. http://localhost:3000 or http://localhost:3000/api).
 */
const API_PREFIX = "/api";

function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) {
    return "";
  }
  if (trimmed.endsWith(API_PREFIX)) {
    return trimmed;
  }
  return `${trimmed}${API_PREFIX}`;
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const fromRuntime = window.__KUBEARA_CONFIG__?.VITE_API_URL?.trim();
    if (fromRuntime) {
      return normalizeApiBaseUrl(fromRuntime);
    }
  }

  const fromBuild = import.meta.env.VITE_API_URL?.trim() ?? "";
  return normalizeApiBaseUrl(fromBuild);
}
