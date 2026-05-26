import { Link } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { AuthForm } from "@/components/auth-form";
import {
  getMutationErrorMessage,
  useForgotPasswordMutation,
} from "@/api/hooks/use-auth";

export function ForgotPasswordPage() {
  const forgotMutation = useForgotPasswordMutation();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    setResetLink(null);

    try {
      const data = await forgotMutation.mutateAsync(
        String(formData.get("email") ?? "").trim(),
      );
      setSuccess(data.message);
      if (data.resetLink) {
        try {
          const url = new URL(data.resetLink);
          setResetLink(`${url.pathname}${url.search}`);
        } catch {
          setResetLink(data.resetLink);
        }
      }
    } catch (err) {
      setError(getMutationErrorMessage(err, "Request failed."));
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
            autoComplete: "email",
            placeholder: "you@company.com",
          },
        ]}
        submitLabel="Send reset link"
        onSubmit={handleSubmit}
        error={error}
        success={success}
        loading={forgotMutation.isPending}
      />
      {resetLink && (
        <p className="demo-reset-link">
          Demo reset link:{" "}
          <Link to={resetLink}>Reset password</Link>
        </p>
      )}
    </AuthCard>
  );
}
