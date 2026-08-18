/**
 * API base URL for the control panel (includes Nest global prefix `/api`).
 * Docker/production: set via /env.js (window.__KUBEARA_CONFIG__.VITE_API_URL).
 * Local dev: set VITE_API_URL in console-app/.env (e.g. http://localhost:3000 or http://localhost:3000/api).
 */
const API_PREFIX = "/api";

/** Hostnames browsers treat as loopback — not interchangeable for cookies. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

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

/**
 * When the SPA is opened on one loopback host (e.g. 127.0.0.1) but VITE_API_URL
 * points at another (e.g. localhost), auth cookies break: browsers treat them as
 * different sites. Rewrite the API hostname to match the page for loopback only.
 */
export function alignLoopbackApiHost(
  apiBaseUrl: string,
  pageHostname = typeof window !== "undefined" ? window.location.hostname : "",
): string {
  if (!apiBaseUrl || !pageHostname) {
    return apiBaseUrl;
  }

  try {
    const url = new URL(apiBaseUrl, window.location.origin);
    const apiHost = url.hostname;
    if (
      !LOOPBACK_HOSTS.has(apiHost) ||
      !LOOPBACK_HOSTS.has(pageHostname) ||
      apiHost === pageHostname
    ) {
      return apiBaseUrl;
    }

    url.hostname = pageHostname;
    return `${url.origin}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return apiBaseUrl;
  }
}

export function getApiBaseUrl(): string {
  let raw = "";
  if (typeof window !== "undefined") {
    const fromRuntime = window.__KUBEARA_CONFIG__?.VITE_API_URL?.trim();
    if (fromRuntime) {
      raw = fromRuntime;
    }
  }

  if (!raw) {
    raw = import.meta.env.VITE_API_URL?.trim() ?? "";
  }

  return alignLoopbackApiHost(normalizeApiBaseUrl(raw));
}
