import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { PasswordField } from "@/components/shared/password-field";
import { useResetPasswordMutation } from "@/features/auth/hooks";
import { getErrorMessage } from "@/api/api-error";
import { validatePassword } from "@/lib/validation";

export function ResetPasswordPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const email = searchParams.get("email") ?? "";
    const resetMutation = useResetPasswordMutation();

    const [error, setError] = useState<string | null>(
        email ? null : "Missing email parameter.",
    );
    const [success, setSuccess] = useState<string | null>(null);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!email) return;

        setError(null);

        const nextFieldErrors: Record<string, string> = {};
        const passwordError = validatePassword(password);
        if (passwordError) nextFieldErrors.password = passwordError;

        if (password !== confirmPassword) {
            nextFieldErrors.confirmPassword = "Passwords do not match.";
        }

        if (Object.keys(nextFieldErrors).length > 0) {
            setFieldErrors(nextFieldErrors);
            return;
        }
        setFieldErrors({});

        try {
            const data = await resetMutation.mutateAsync({
                email,
                newPassword: password,
            });
            setSuccess(data.message);

            setTimeout(() => {
                navigate("/login", { replace: true });
            }, 1500);
        } catch (err) {
            setError(getErrorMessage(err));
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
            {email ? (
                <form onSubmit={handleSubmit} className="auth-form" noValidate>
                    <PasswordField
                        id="password"
                        name="password"
                        label="New password"
                        value={password}
                        onChange={setPassword}
                        autoComplete="new-password"
                        showRules
                        disabled={resetMutation.isPending}
                    />
                    {fieldErrors.password && (
                        <p className="form-field-error">{fieldErrors.password}</p>
                    )}
                    <PasswordField
                        id="confirmPassword"
                        name="confirmPassword"
                        label="Confirm new password"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        autoComplete="new-password"
                        placeholder="Repeat password"
                        disabled={resetMutation.isPending}
                    />
                    {fieldErrors.confirmPassword && (
                        <p className="form-field-error">
                            {fieldErrors.confirmPassword}
                        </p>
                    )}
                    {error && <p className="form-message error">{error}</p>}
                    {success && <p className="form-message success">{success}</p>}
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={resetMutation.isPending}
                    >
                        {resetMutation.isPending ? "Please wait…" : "Update password"}
                    </button>
                </form>
            ) : (
                <p className="form-message error">{error}</p>
            )}
        </AuthCard>
    );
}
