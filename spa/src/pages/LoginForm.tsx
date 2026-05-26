import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { AuthForm } from "@/components/auth-form";
import {
  getMutationErrorMessage,
  useLoginMutation,
} from "@/api/hooks/use-auth";
import { DEV_TEST_USER } from "@/lib/dev-test-user";

export function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginMutation = useLoginMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);

    try {
      await loginMutation.mutateAsync({
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
      });
      const from = searchParams.get("from") ?? "/servers";
      navigate(from, { replace: true });
    } catch (err) {
      setError(getMutationErrorMessage(err, "Login failed."));
    }
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back. Enter your credentials to continue."
      footer={
        <p>
          Don&apos;t have an account?{" "}
          <Link to="/register">Create one</Link>
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
          {
            id: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
            placeholder: "••••••••",
          },
        ]}
        submitLabel="Sign in"
        onSubmit={handleSubmit}
        error={error}
        loading={loginMutation.isPending}
      >
        <p className="auth-form-link">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
      </AuthForm>
      {import.meta.env.DEV && (
        <p className="dev-test-user-hint">
          Local test account:{" "}
          <code>{DEV_TEST_USER.email}</code> / <code>{DEV_TEST_USER.password}</code>
        </p>
      )}
    </AuthCard>
  );
}
