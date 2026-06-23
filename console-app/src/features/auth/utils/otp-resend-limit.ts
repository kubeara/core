/**
 * Client-side OTP resend rate limiting persisted in localStorage.
 * Tracks resend attempts per email and auth flow within a rolling time window.
 */
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

/**
 * Builds a stable localStorage key for the given email and OTP flow.
 * Email is normalized to lowercase and trimmed before use.
 */
function getResendLimitStorageKey(
  email: string,
  flow: OtpResendFlow,
): string {
  return `otp-resend-limit:${flow}:${email.toLowerCase().trim()}`;
}

/**
 * Reads and validates persisted resend-limit state from localStorage.
 * Returns an empty state when the entry is missing, expired, or malformed.
 */
export function loadOtpResendLimitState(
  email: string,
  flow: OtpResendFlow,
): OtpResendLimitState {
  if (!email) {
    return EMPTY_STATE;
  }

  const storageKey = getResendLimitStorageKey(email, flow);

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return EMPTY_STATE;
    }

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
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // localStorage may be unavailable; ignore cleanup failure.
    }
    return EMPTY_STATE;
  }
}

/**
 * Persists resend-limit state for the given email and OTP flow.
 */
export function saveOtpResendLimitState(
  email: string,
  flow: OtpResendFlow,
  state: OtpResendLimitState,
): void {
  try {
    window.localStorage.setItem(
      getResendLimitStorageKey(email, flow),
      JSON.stringify(state),
    );
  } catch {
    // localStorage may be unavailable or full; limit state won't persist client-side.
  }
}

/**
 * Removes persisted resend-limit state for the given email and OTP flow.
 */
export function clearOtpResendLimitState(
  email: string,
  flow: OtpResendFlow,
): void {
  try {
    window.localStorage.removeItem(getResendLimitStorageKey(email, flow));
  } catch {
    // localStorage may be unavailable; nothing to clear.
  }
}

/**
 * Returns whether a resend-limit window is currently active for the email and flow.
 */
export function hasActiveOtpWindow(
  email: string,
  flow: OtpResendFlow,
): boolean {
  return loadOtpResendLimitState(email, flow).startedAt > 0;
}

/**
 * Returns whether the maximum number of OTP resend attempts has been reached.
 */
export function isOtpResendLimitReached(
  email: string,
  flow: OtpResendFlow,
): boolean {
  const state = loadOtpResendLimitState(email, flow);
  return state.count >= OTP_RESEND_MAX_ATTEMPTS;
}

/**
 * Opens a new resend-limit window if one is not already active.
 * The initial OTP send does not increment the resend count.
 */
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

/**
 * Records one OTP resend attempt and persists the updated state.
 * Starts a new window automatically when none is active.
 */
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

/**
 * Aligns local resend-limit state with a server-side rate-limit response.
 * Marks the limit as reached and back-calculates window start from retryAfterSeconds when provided.
 */
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

/**
 * Returns the number of seconds remaining before the resend window resets.
 */
export function getOtpResendRetrySecondsForState(
  startedAt: number,
): number {
  return getOtpResendRetrySecondsRemaining(startedAt);
}
