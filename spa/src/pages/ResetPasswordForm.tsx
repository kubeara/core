import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { AuthForm } from "@/components/auth-form";
import {
  getMutationErrorMessage,
  useResetPasswordMutation,
} from "@/api/hooks/use-auth";

export function ResetPasswordForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const resetMutation = useResetPasswordMutation();

  const [error, setError] = useState<string | null>(
    token ? null : "Missing or invalid reset token.",
  );
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    if (!token) return;

    setError(null);

    const password = formData.get("password") as string;
    const confirm = formData.get("confirmPassword") as string;

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const data = await resetMutation.mutateAsync({ token, password });
      setSuccess(data.message);
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1500);
    } catch (err) {
      setError(getMutationErrorMessage(err, "Reset failed."));
    }
  }

  return (
    <AuthCard
      title="Reset password"
      subtitle="Choose a new password for your account."
      footer={
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      }
    >
      {token ? (
        <AuthForm
          fields={[
            {
              id: "password",
              label: "New password",
              type: "password",
              autoComplete: "new-password",
              placeholder: "At least 8 characters",
            },
            {
              id: "confirmPassword",
              label: "Confirm new password",
              type: "password",
              autoComplete: "new-password",
              placeholder: "Repeat password",
            },
          ]}
          submitLabel="Update password"
          onSubmit={handleSubmit}
          error={error}
          success={success}
          loading={resetMutation.isPending}
        />
      ) : (
        <p className="form-message error">{error}</p>
      )}
    </AuthCard>
  );
}
