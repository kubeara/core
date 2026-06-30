import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthForm } from "@/features/auth/components/auth-form";
import { useForgotPasswordMutation } from "@/features/auth/hooks";
import {
  extractRetryAfterSeconds,
  getErrorMessage,
  toApiError,
} from "@/api/api-error";
import { validateEmail } from "@/lib/validation";
import { showSuccessToast } from "@/lib/toast";
import {
  hasActiveOtpWindow,
  isOtpResendLimitReached,
  recordOtpResend,
  startOtpWindow,
  syncOtpResendLimitFromApiError,
} from "@/features/auth/utils/otp-resend-limit";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const forgotMutation = useForgotPasswordMutation();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(formData: FormData) {
    setError(null);

    const email = String(formData.get("email") ?? "").trim();
    const emailError = validateEmail(email);
    if (emailError) {
      setFieldErrors({ email: emailError });
      return;
    }
    setFieldErrors({});

    // Skip API call when client-side resend limit is already reached.
    if (isOtpResendLimitReached(email, "forgot-password")) {
      navigate(`/forgot-password/verify?email=${encodeURIComponent(email)}`, {
        replace: true,
      });
      return;
    }

    try {
      const data = await forgotMutation.mutateAsync({ email });
      if (hasActiveOtpWindow(email, "forgot-password")) {
        recordOtpResend(email, "forgot-password");
      } else {
        startOtpWindow(email, "forgot-password");
      }
      showSuccessToast(data.message);
      navigate(`/forgot-password/verify?email=${encodeURIComponent(email)}`, {
        replace: true,
      });
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.status === 429) {
        syncOtpResendLimitFromApiError(
          email,
          "forgot-password",
          extractRetryAfterSeconds(apiError.body) ?? undefined,
        );
        navigate(`/forgot-password/verify?email=${encodeURIComponent(email)}`, {
          replace: true,
        });
        return;
      }
      setError(getErrorMessage(err));
    }
  }

  return (
    <AuthCard
      title="Forgot password"
      subtitle="Enter your email and we'll send reset instructions."
      footer={
        <p>
          Remember your password? <Link to="/login">Back to sign in</Link>
        </p>
      }
    >
      <AuthForm
        fields={[
          {
            id: "email",
            label: "Email",
            type: "email",
            validateAsEmail: true,
            autoComplete: "email",
            placeholder: "you@company.com",
          },
        ]}
        submitLabel="Send verification code"
        onSubmit={handleSubmit}
        error={error}
        errorAfterFields
        fieldErrors={fieldErrors}
        loading={forgotMutation.isPending}
      />
    </AuthCard>
  );
}
