import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { OtpInput } from "@/features/auth/components/otp-input";
import { FormErrorsSummary } from "@/components/shared/form-errors-summary";
import {
  OTP_CODE_TYPE,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_RESEND_MAX_ATTEMPTS,
  OTP_RESEND_WINDOW_MS,
  AUTH_ERROR_MESSAGES,
  AUTH_UI_MESSAGES,
  getOtpResendLimitNote,
} from "@/features/auth/constants";
import {
  clearOtpResendLimitState,
  getOtpResendRetrySecondsForState,
  loadOtpResendLimitState,
  recordOtpResend,
  startOtpWindow,
  syncOtpResendLimitFromApiError,
} from "@/features/auth/utils/otp-resend-limit";
import {
  useResendOtpMutation,
  useVerifyOtpMutation,
} from "@/features/auth/hooks";
import {
  extractRetryAfterSeconds,
  getErrorMessage,
  toApiError,
} from "@/api/api-error";
import { showSuccessToast } from "@/lib/toast";

const OTP_RESEND_FLOW = "email-verification" as const;

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const verifyMutation = useVerifyOtpMutation();
  const resendMutation = useResendOtpMutation();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(
    email ? null : AUTH_ERROR_MESSAGES.MISSING_EMAIL_PARAMETER,
  );
  const [cooldown, setCooldown] = useState(OTP_RESEND_COOLDOWN_SECONDS);
  const [resendLimitState, setResendLimitState] = useState(() =>
    loadOtpResendLimitState(email, OTP_RESEND_FLOW),
  );
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  const resendCount = resendLimitState.count;
  const isResendLimitReached = resendCount >= OTP_RESEND_MAX_ATTEMPTS;
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

  const isPending = verifyMutation.isPending || resendMutation.isPending;

  /** Opens a resend-limit window when the user lands on this page with an email. */
  useEffect(() => {
    if (email) {
      setResendLimitState(startOtpWindow(email, OTP_RESEND_FLOW));
    }
  }, [email]);

  /**
   * Clears expired resend-limit state when the rolling window elapses.
   */
  useEffect(() => {
    if (!email || resendLimitState.startedAt <= 0) {
      return;
    }

    const elapsed = Date.now() - resendLimitState.startedAt;
    const remaining = OTP_RESEND_WINDOW_MS - elapsed;

    if (remaining <= 0) {
      clearOtpResendLimitState(email, OTP_RESEND_FLOW);
      setResendLimitState({ count: 0, startedAt: 0 });
      return;
    }

    const timer = window.setTimeout(() => {
      clearOtpResendLimitState(email, OTP_RESEND_FLOW);
      setResendLimitState({ count: 0, startedAt: 0 });
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [email, resendLimitState.startedAt]);

  /**
   * Counts down remaining retry time while the resend limit is active.
   */
  useEffect(() => {
    if (!isResendLimitReached || resendLimitState.startedAt <= 0) {
      setRetryAfterSeconds(0);
      return;
    }

    function updateRetryAfterSeconds() {
      setRetryAfterSeconds(
        getOtpResendRetrySecondsForState(resendLimitState.startedAt),
      );
    }

    updateRetryAfterSeconds();
    const interval = window.setInterval(updateRetryAfterSeconds, 1000);
    return () => window.clearInterval(interval);
  }, [isResendLimitReached, resendLimitState.startedAt]);

  /** Ticks down the per-resend cooldown timer. */
  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCooldown((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || otp.length !== 6) {
      setError(AUTH_ERROR_MESSAGES.OTP_REQUIRED);
      return;
    }

    setError(null);

    try {
      const data = await verifyMutation.mutateAsync({
        email,
        otp,
        codeType: OTP_CODE_TYPE.EMAIL_VERIFICATION,
      });
      showSuccessToast(data.message);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleResend() {
    if (
      !email ||
      cooldown > 0 ||
      resendMutation.isPending ||
      isResendLimitReached
    ) {
      return;
    }

    setError(null);

    try {
      const data = await resendMutation.mutateAsync({ email });
      showSuccessToast(data.message);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setOtp("");
      setResendLimitState(recordOtpResend(email, OTP_RESEND_FLOW));
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.status === 429) {
        setResendLimitState(
          syncOtpResendLimitFromApiError(
            email,
            OTP_RESEND_FLOW,
            extractRetryAfterSeconds(apiError.body) ?? undefined,
          ),
        );
      }
      setError(getErrorMessage(err));
    }
  }

  return (
    <AuthCard
      title="Verify your email"
      subtitle={
        email ? (
          <>
            <p className="verify-email-address">{email}</p>
            <p>{AUTH_UI_MESSAGES.OTP_INSTRUCTION}</p>
          </>
        ) : undefined
      }
      footer={
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      }
    >
      {email ? (
        <form onSubmit={handleVerify} className="auth-form" noValidate>
          <div className="form-field">
            <label>Verification code</label>
            <OtpInput
              value={otp}
              onChange={(value) => {
                setOtp(value);
                setError(null);
              }}
              disabled={isPending}
            />
          </div>
          <FormErrorsSummary formError={error} />
          <button
            type="submit"
            className="btn-primary"
            disabled={isPending || otp.length !== 6}
          >
            {verifyMutation.isPending ? "Please wait…" : "Verify email"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleResend}
            disabled={isPending || cooldown > 0 || isResendLimitReached}
          >
            {resendMutation.isPending
              ? "Please wait…"
              : isResendLimitReached
                ? AUTH_UI_MESSAGES.RESEND_LIMIT_REACHED
                : cooldown > 0
                  ? `Resend code in ${cooldown}s`
                  : AUTH_UI_MESSAGES.RESEND_CODE}
          </button>
          {isResendLimitReached && retryAfterSeconds > 0 && (
            <p className="auth-form-note">
              {getOtpResendLimitNote(retryAfterMinutes)}
            </p>
          )}
        </form>
      ) : (
        <p className="form-message error">{error}</p>
      )}
    </AuthCard>
  );
}
