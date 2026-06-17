import {
  OTP_RESEND_MAX_ATTEMPTS,
  OTP_RESEND_WINDOW_MS,
  getOtpResendRetrySecondsRemaining,
} from "@/features/auth/constants";

export type OtpResendFlow = "email-verification" | "forgot-password";

export type OtpResendLimitState = {
  /** Resend attempts used (initial OTP is not counted). */
  count: number;
  startedAt: number;
};

const EMPTY_STATE: OtpResendLimitState = { count: 0, startedAt: 0 };

function getResendLimitStorageKey(
  email: string,
  flow: OtpResendFlow,
): string {
  return `otp-resend-limit:${flow}:${email.toLowerCase().trim()}`;
}

export function loadOtpResendLimitState(
  email: string,
  flow: OtpResendFlow,
): OtpResendLimitState {
  if (!email) {
    return EMPTY_STATE;
  }

  const storageKey = getResendLimitStorageKey(email, flow);
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return EMPTY_STATE;
  }

  try {
    const parsed = JSON.parse(raw) as { count?: number; startedAt?: number };
    const count = Number(parsed.count ?? 0);
    const startedAt = Number(parsed.startedAt ?? 0);

    if (
      !Number.isFinite(count) ||
      !Number.isFinite(startedAt) ||
      count < 0 ||
      startedAt <= 0
    ) {
      window.localStorage.removeItem(storageKey);
      return EMPTY_STATE;
    }

    if (Date.now() - startedAt >= OTP_RESEND_WINDOW_MS) {
      window.localStorage.removeItem(storageKey);
      return EMPTY_STATE;
    }

    return { count, startedAt };
  } catch {
    window.localStorage.removeItem(storageKey);
    return EMPTY_STATE;
  }
}

export function saveOtpResendLimitState(
  email: string,
  flow: OtpResendFlow,
  state: OtpResendLimitState,
): void {
  window.localStorage.setItem(
    getResendLimitStorageKey(email, flow),
    JSON.stringify(state),
  );
}

export function clearOtpResendLimitState(
  email: string,
  flow: OtpResendFlow,
): void {
  window.localStorage.removeItem(getResendLimitStorageKey(email, flow));
}

export function hasActiveOtpWindow(
  email: string,
  flow: OtpResendFlow,
): boolean {
  return loadOtpResendLimitState(email, flow).startedAt > 0;
}

export function isOtpResendLimitReached(
  email: string,
  flow: OtpResendFlow,
): boolean {
  const state = loadOtpResendLimitState(email, flow);
  return state.count >= OTP_RESEND_MAX_ATTEMPTS;
}

export function startOtpWindow(
  email: string,
  flow: OtpResendFlow,
): OtpResendLimitState {
  const current = loadOtpResendLimitState(email, flow);
  if (current.startedAt > 0) {
    return current;
  }

  const state = { count: 0, startedAt: Date.now() };
  saveOtpResendLimitState(email, flow, state);
  return state;
}

export function recordOtpResend(
  email: string,
  flow: OtpResendFlow,
): OtpResendLimitState {
  const current = loadOtpResendLimitState(email, flow);
  const base =
    current.startedAt > 0 ? current : { count: 0, startedAt: Date.now() };
  const next = {
    count: base.count + 1,
    startedAt: base.startedAt,
  };
  saveOtpResendLimitState(email, flow, next);
  return next;
}

export function syncOtpResendLimitFromApiError(
  email: string,
  flow: OtpResendFlow,
  retryAfterSeconds?: number,
): OtpResendLimitState {
  const startedAt =
    retryAfterSeconds != null && retryAfterSeconds > 0
      ? Date.now() - (OTP_RESEND_WINDOW_MS - retryAfterSeconds * 1000)
      : Date.now();
  const state = {
    count: OTP_RESEND_MAX_ATTEMPTS,
    startedAt,
  };
  saveOtpResendLimitState(email, flow, state);
  return state;
}

export function getOtpResendRetrySecondsForState(
  startedAt: number,
): number {
  return getOtpResendRetrySecondsRemaining(startedAt);
}
