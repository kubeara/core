import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthForm } from "@/features/auth/components/auth-form";
import { useLoginMutation } from "@/features/auth/hooks";
import { AUTH_ERROR_MESSAGES } from "@/features/auth/constants";
import { getErrorMessage, toApiError } from "@/api/api-error";
import { validateEmail, validateRequired } from "@/lib/validation";

function isOAuthLoginReturn(from: string | null): boolean {
  return from?.startsWith("/oauth/authorize") ?? false;
}

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

    const from = searchParams.get("from");
    const isOAuthFlow = isOAuthLoginReturn(from);

    async function handleSubmit(formData: FormData) {
        setError(null);

        const email = String(formData.get("email") ?? "");
        const password = String(formData.get("password") ?? "");

        const nextFieldErrors: Record<string, string> = {};
        const emailError = validateEmail(email);
        if (emailError) nextFieldErrors.email = emailError;

        const passwordError = validateRequired(password, "Password");
        if (passwordError) nextFieldErrors.password = passwordError;

        if (Object.keys(nextFieldErrors).length > 0) {
            setFieldErrors(nextFieldErrors);
            return;
        }
        setFieldErrors({});

        try {
            await loginMutation.mutateAsync({
                email: email.trim(),
                password,
            });

            // GuestRoute sends logged-in users to `from` when present.
            const destination = from?.startsWith("/") ? from : "/servers";
            navigate(destination, { replace: true });
        } catch (err) {
            const apiError = toApiError(err);
            if (
                apiError.message
                    .toLowerCase()
                    .includes(AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED.toLowerCase())
            ) {
                navigate(
                    `/verify-email?email=${encodeURIComponent(email.trim())}`,
                    { replace: true },
                );
                return;
            }
            setError(getErrorMessage(err));
        }
    }

    return (
        <AuthCard
            title={isOAuthFlow ? "Sign in to connect ChatGPT" : "Sign in"}
            subtitle={
                isOAuthFlow
                    ? "Sign in to your Kubeara account, then you will approve access for ChatGPT."
                    : "Welcome back. Enter your credentials to continue."
            }
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
                errorAfterFields
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
