/**
 * API base URL for the control panel.
 * Docker/production: set via /env.js (window.__KUBEARA_CONFIG__.VITE_API_URL).
 * Local dev: set VITE_API_URL in console-app/.env (e.g. http://localhost:3000/api).
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const fromRuntime = window.__KUBEARA_CONFIG__?.VITE_API_URL?.trim();
    if (fromRuntime) {
      return fromRuntime.replace(/\/$/, "");
    }
  }

  const fromBuild = import.meta.env.VITE_API_URL?.trim() ?? "";
  return fromBuild.replace(/\/$/, "");
}
