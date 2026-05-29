import { Link } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthForm } from "@/features/auth/components/auth-form";
import { useForgotPasswordMutation } from "@/features/auth/hooks";
import { getErrorMessage } from "@/api/api-error";
import { validateEmail } from "@/lib/validation";

/**
 * Forgot password page component.
 * 
 * Features:
 * - Request password reset OTP via email
 * - Success message display
 * - Link back to login page
 * - Error handling and display
 */
export function ForgotPasswordPage() {
    const forgotMutation = useForgotPasswordMutation();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    async function handleSubmit(formData: FormData) {
        setError(null);
        setSuccess(null);

        const email = String(formData.get("email") ?? "");
        const emailError = validateEmail(email);
        if (emailError) {
            setFieldErrors({ email: emailError });
            return;
        }
        setFieldErrors({});

        try {
            const data = await forgotMutation.mutateAsync({
                email: String(formData.get("email") ?? "").trim(),
            });
            setSuccess(data.message);
        } catch (err) {
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
                submitLabel="Send reset link"
                onSubmit={handleSubmit}
                error={error}
                fieldErrors={fieldErrors}
                success={success}
                loading={forgotMutation.isPending}
            />
        </AuthCard>
    );
}
