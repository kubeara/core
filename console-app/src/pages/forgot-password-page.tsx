import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthForm } from "@/features/auth/components/auth-form";
import { useForgotPasswordMutation } from "@/features/auth/hooks";
import { getErrorMessage } from "@/api/api-error";
import { validateEmail } from "@/lib/validation";
import { showSuccessToast } from "@/lib/toast";

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

        try {
            const data = await forgotMutation.mutateAsync({ email });
            showSuccessToast(data.message);
            navigate(`/forgot-password/verify?email=${encodeURIComponent(email)}`, {
                replace: true,
            });
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
