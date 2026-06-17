import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { OtpInput } from "@/features/auth/components/otp-input";
import { FormErrorsSummary } from "@/components/shared/form-errors-summary";
import {
  OTP_CODE_TYPE,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "@/features/auth/constants";
import {
  useResendOtpMutation,
  useVerifyOtpMutation,
} from "@/features/auth/hooks";
import { getErrorMessage } from "@/api/api-error";
import { showSuccessToast } from "@/lib/toast";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const verifyMutation = useVerifyOtpMutation();
  const resendMutation = useResendOtpMutation();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(
    email ? null : "Missing email parameter.",
  );
  const [cooldown, setCooldown] = useState(OTP_RESEND_COOLDOWN_SECONDS);

  const isPending = verifyMutation.isPending || resendMutation.isPending;

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
      setError("Enter the 6-digit verification code.");
      return;
    }

    setError(null);

    try {
      const data = await verifyMutation.mutateAsync({
        email,
        otp,
        purpose: OTP_CODE_TYPE.EMAIL_VERIFICATION,
      });
      showSuccessToast(data.message);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleResend() {
    if (!email || cooldown > 0 || resendMutation.isPending) {
      return;
    }

    setError(null);

    try {
      const data = await resendMutation.mutateAsync({ email });
      showSuccessToast(data.message);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setOtp("");
    } catch (err) {
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
            <p>Enter the 6-digit code sent to your email address.</p>
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
            disabled={isPending || cooldown > 0}
          >
            {resendMutation.isPending
              ? "Please wait…"
              : cooldown > 0
                ? `Resend code in ${cooldown}s`
                : "Resend code"}
          </button>
        </form>
      ) : (
        <p className="form-message error">{error}</p>
      )}
    </AuthCard>
  );
}
