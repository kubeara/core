import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthForm } from "@/features/auth/components/auth-form";
import { useLoginMutation } from "@/features/auth/hooks";
import { getErrorMessage } from "@/api/api-error";
import { validateEmail } from "@/lib/validation";

/**
 * Login page component.
 * 
 * Features:
 * - Email and password authentication
 * - Redirect to intended page after login (via ?from query param)
 * - Link to registration page
 * - Link to forgot password page
 * - Error handling and display
 */
export function LoginPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const loginMutation = useLoginMutation();
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    async function handleSubmit(formData: FormData) {
        setError(null);
        const email = String(formData.get("email") ?? "");
        const emailError = validateEmail(email);
        if (emailError) {
            setFieldErrors({ email: emailError });
            return;
        }
        setFieldErrors({});

        try {
            await loginMutation.mutateAsync({
                email: String(formData.get("email") ?? "").trim(),
                password: String(formData.get("password") ?? ""),
            });

            // Redirect to intended page or default to /servers
            const from = searchParams.get("from") ?? "/servers";
            navigate(from, { replace: true });
        } catch (err) {
            setError(getErrorMessage(err));
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
                        validateAsEmail: true,
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
                fieldErrors={fieldErrors}
                loading={loginMutation.isPending}
            >
                <p className="auth-form-link">
                    <Link to="/forgot-password">Forgot password?</Link>
                </p>
            </AuthForm>
        </AuthCard>
    );
}
