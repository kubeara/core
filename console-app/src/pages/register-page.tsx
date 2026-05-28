import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthForm } from "@/features/auth/components/auth-form";
import { useSignupMutation } from "@/features/auth/hooks";
import { getErrorMessage } from "@/api/api-error";

/**
 * Registration/signup page component.
 * 
 * Features:
 * - User registration with name, email, and password
 * - Password confirmation validation
 * - Automatic login after successful registration
 * - Link to login page for existing users
 * - Error handling and display
 */
export function RegisterPage() {
    const navigate = useNavigate();
    const signupMutation = useSignupMutation();
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        setError(null);

        const password = formData.get("password") as string;
        const confirm = formData.get("confirmPassword") as string;

        // Validate password confirmation
        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }

        try {
            await signupMutation.mutateAsync({
                name: String(formData.get("name") ?? "").trim(),
                email: String(formData.get("email") ?? "").trim(),
                password,
            });

            // Redirect to login after successful registration
            navigate("/login", { replace: true });
        } catch (err) {
            setError(getErrorMessage(err));
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
                loading={signupMutation.isPending}
            />
        </AuthCard>
    );
}
