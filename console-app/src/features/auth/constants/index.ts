/** BroadcastChannel name for cross-tab auth synchronization */
export const AUTH_BROADCAST_CHANNEL = "kubeara-auth";

/** Auth endpoints that must not trigger the 401 refresh interceptor */
export const AUTH_ENDPOINTS_WITHOUT_REFRESH = [
  "/auth/login",
  "/auth/signup",
  "/auth/refresh-token",
  "/auth/logout",
  "/auth/logout-all",
  "/auth/forgot-password",
  "/auth/verify-otp",
  "/auth/reset-password",
] as const;

export function shouldSkipRefreshForUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return AUTH_ENDPOINTS_WITHOUT_REFRESH.some((endpoint) =>
    url.includes(endpoint),
  );
}
