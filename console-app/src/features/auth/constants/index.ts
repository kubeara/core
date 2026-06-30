/**
 * OTP verification purpose values
 */
export const OTP_CODE_TYPE = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  FORGOT_PASSWORD: "FORGOT_PASSWORD",
} as const;

export type OtpCodeType =
  (typeof OTP_CODE_TYPE)[keyof typeof OTP_CODE_TYPE];

/**
 * Cooldown (seconds) before another OTP resend can be requested.
 * Configurable via VITE_RESEND_OTP_COOLDOWN_SECONDS; defaults to 60.
 */
const parsedResendCooldownSeconds = Number(
  import.meta.env.VITE_RESEND_OTP_COOLDOWN_SECONDS,
);
export const OTP_RESEND_COOLDOWN_SECONDS =
  Number.isFinite(parsedResendCooldownSeconds) && parsedResendCooldownSeconds > 0
    ? parsedResendCooldownSeconds
    : 60;

/**
 * Maximum OTP resend attempts allowed within the rolling resend window.
 * Configurable via VITE_RESEND_OTP_MAX_ATTEMPTS; defaults to 3.
 */
export const OTP_RESEND_MAX_ATTEMPTS = (() => {
  const parsed = Number(import.meta.env.VITE_RESEND_OTP_MAX_ATTEMPTS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
})();

/**
 * Rolling window (minutes) used to count OTP resend attempts.
 * Configurable via VITE_RESEND_OTP_MINUTES; defaults to 15.
 */
const parsedResendWindowMinutes = Number(import.meta.env.VITE_RESEND_OTP_MINUTES);
export const OTP_RESEND_WINDOW_MINUTES =
  Number.isFinite(parsedResendWindowMinutes) && parsedResendWindowMinutes > 0
    ? parsedResendWindowMinutes
    : 15;

/** Rolling resend window length in milliseconds. */
export const OTP_RESEND_WINDOW_MS = OTP_RESEND_WINDOW_MINUTES * 60 * 1000;

/**
 * Seconds remaining until the resend limit window resets.
 */
export function getOtpResendRetrySecondsRemaining(startedAt: number): number {
  const remaining = OTP_RESEND_WINDOW_MS - (Date.now() - startedAt);
  return Math.max(1, Math.ceil(remaining / 1000));
}

/**
 * Minutes remaining until the resend limit window resets (minimum 1).
 */
export function getOtpResendRetryMinutesRemaining(startedAt: number): number {
  return Math.max(1, Math.ceil(getOtpResendRetrySecondsRemaining(startedAt) / 60));
}

export const AUTH_TOAST_MESSAGES = {
  OTP_SENT: "Verification code sent to your email.",
  OTP_RESENT: "A new verification code has been sent to your email.",
  EMAIL_VERIFIED: "Your email has been verified. You can sign in now.",
  RESET_CODE_VERIFIED: "Code verified. You can set a new password.",
  PASSWORD_RESET: "Your password has been updated. You can sign in now.",
} as const;

export const AUTH_ERROR_MESSAGES = {
  MISSING_EMAIL_PARAMETER: "Missing email parameter.",
  OTP_REQUIRED: "Enter the 6-digit verification code.",
  EMAIL_NOT_VERIFIED: "Email not verified",
} as const;

export const AUTH_UI_MESSAGES = {
  OTP_INSTRUCTION: "Enter the 6-digit code sent to your email address.",
  RESEND_LIMIT_REACHED: "Resend limit reached",
  RESEND_CODE: "Resend code",
} as const;

export function getOtpResendLimitNote(retryAfterMinutes: number): string {
  return `You have reached the resend limit. Try again after ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`;
}

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
