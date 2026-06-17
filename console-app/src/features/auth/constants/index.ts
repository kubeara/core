/**
 * OTP verification purpose values
 */
export const OTP_CODE_TYPE = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  FORGOT_PASSWORD: "FORGOT_PASSWORD",
} as const;

export type OtpCodeType =
  (typeof OTP_CODE_TYPE)[keyof typeof OTP_CODE_TYPE];

export const OTP_RESEND_COOLDOWN_SECONDS = 60;

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
  "/auth/resend-otp",
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
