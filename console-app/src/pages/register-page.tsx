import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { FormErrorsSummary } from "@/components/shared/form-errors-summary";
import { FormFieldLabel } from "@/components/shared/form-field-label";
import { PasswordField } from "@/components/shared/password-field";
import { useSignupMutation } from "@/features/auth/hooks";
import { getErrorMessage } from "@/api/api-error";
import {
    validateEmail,
    validatePassword,
    validateRequired,
} from "@/lib/validation";

export function RegisterPage() {
    const navigate = useNavigate();
    const signupMutation = useSignupMutation();
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    function clearFieldError(fieldId: string) {
        setError(null);
        setFieldErrors((current) => {
            if (!current[fieldId]) return current;
            const next = { ...current };
            delete next[fieldId];
            return next;
        });
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        const nextFieldErrors: Record<string, string> = {};

        const nameError = validateRequired(name, "Name");
        if (nameError) nextFieldErrors.name = nameError;

        const emailError = validateEmail(email);
        if (emailError) nextFieldErrors.email = emailError;

        const passwordError = validatePassword(password);
        if (passwordError) nextFieldErrors.password = passwordError;

        const confirmPasswordError = validateRequired(
            confirmPassword,
            "Confirm password",
        );
        if (confirmPasswordError) {
            nextFieldErrors.confirmPassword = confirmPasswordError;
        } else if (password !== confirmPassword) {
            nextFieldErrors.confirmPassword = "Passwords do not match.";
        }

        if (Object.keys(nextFieldErrors).length > 0) {
            setFieldErrors(nextFieldErrors);
            return;
        }
        setFieldErrors({});

        try {
            await signupMutation.mutateAsync({
                name: name.trim(),
                email: email.trim(),
                password,
            });

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
            <form onSubmit={handleSubmit} className="auth-form" noValidate>
                <FormErrorsSummary formError={error} />
                <div className="form-field">
                    <FormFieldLabel htmlFor="name" required>
                        Full name
                    </FormFieldLabel>
                    <input
                        id="name"
                        name="name"
                        type="text"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            clearFieldError("name");
                        }}
                        autoComplete="name"
                        placeholder="Jane Doe"
                        disabled={signupMutation.isPending}
                        aria-invalid={fieldErrors.name ? true : undefined}
                        aria-describedby={
                            fieldErrors.name ? "name-error" : undefined
                        }
                    />
                    {fieldErrors.name && (
                        <p id="name-error" className="form-field-error" role="alert">
                            {fieldErrors.name}
                        </p>
                    )}
                </div>
                <div className="form-field">
                    <FormFieldLabel htmlFor="email" required>
                        Email
                    </FormFieldLabel>
                    <input
                        id="email"
                        name="email"
                        type="text"
                        inputMode="email"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            clearFieldError("email");
                        }}
                        autoComplete="email"
                        placeholder="you@company.com"
                        disabled={signupMutation.isPending}
                        aria-invalid={fieldErrors.email ? true : undefined}
                        aria-describedby={
                            fieldErrors.email ? "email-error" : undefined
                        }
                    />
                    {fieldErrors.email && (
                        <p id="email-error" className="form-field-error" role="alert">
                            {fieldErrors.email}
                        </p>
                    )}
                </div>
                <PasswordField
                    id="password"
                    name="password"
                    label="Password"
                    value={password}
                    onChange={(value) => {
                        setPassword(value);
                        clearFieldError("password");
                    }}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    showRules
                    disabled={signupMutation.isPending}
                    error={fieldErrors.password}
                />
                <PasswordField
                    id="confirmPassword"
                    name="confirmPassword"
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={(value) => {
                        setConfirmPassword(value);
                        clearFieldError("confirmPassword");
                    }}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    disabled={signupMutation.isPending}
                    error={fieldErrors.confirmPassword}
                />
                <button
                    type="submit"
                    className="btn-primary"
                    disabled={signupMutation.isPending}
                >
                    {signupMutation.isPending ? "Please wait…" : "Create account"}
                </button>
            </form>
        </AuthCard>
    );
}
