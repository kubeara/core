import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthForm } from "@/features/auth/components/auth-form";
import { useResetPasswordMutation } from "@/features/auth/hooks";
import { getErrorMessage } from "@/api/api-error";

/**
 * Reset password page component.
 * 
 * Features:
 * - Reset password with new password
 * - Password confirmation validation
 * - Requires email query parameter
 * - Auto-redirect to login after successful reset
 * - Error handling and display
 */
export function ResetPasswordPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const email = searchParams.get("email") ?? "";
    const resetMutation = useResetPasswordMutation();

    const [error, setError] = useState<string | null>(
        email ? null : "Missing email parameter.",
    );
    const [success, setSuccess] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        if (!email) return;

        setError(null);

        const password = formData.get("password") as string;
        const confirm = formData.get("confirmPassword") as string;

        // Validate password confirmation
        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }

        try {
            const data = await resetMutation.mutateAsync({
                email,
                newPassword: password,
            });
            setSuccess(data.message);

            // Redirect to login after 1.5 seconds
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
