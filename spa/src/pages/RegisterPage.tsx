import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { AuthForm } from "@/components/auth-form";
import {
  getMutationErrorMessage,
  useRegisterMutation,
} from "@/api/hooks/use-auth";

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegisterMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);

    const password = formData.get("password") as string;
    const confirm = formData.get("confirmPassword") as string;

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await registerMutation.mutateAsync({
        name: String(formData.get("name") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        password,
      });
      navigate("/servers", { replace: true });
    } catch (err) {
      setError(getMutationErrorMessage(err, "Registration failed."));
    }
  }

  return (
    <AuthCard
      title="Create account"
      subtitle="Get started with Kubeara in a few steps."
      footer={
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <AuthForm
        fields={[
          {
            id: "name",
            label: "Full name",
            type: "text",
            autoComplete: "name",
            placeholder: "Jane Doe",
          },
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
            autoComplete: "new-password",
            placeholder: "At least 8 characters",
          },
          {
            id: "confirmPassword",
            label: "Confirm password",
            type: "password",
            autoComplete: "new-password",
            placeholder: "Repeat password",
          },
        ]}
        submitLabel="Create account"
        onSubmit={handleSubmit}
        error={error}
        loading={registerMutation.isPending}
      />
    </AuthCard>
  );
}
