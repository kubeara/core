import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { PasswordField } from "@/components/shared/password-field";
import { useSignupMutation } from "@/features/auth/hooks";
import { getErrorMessage } from "@/api/api-error";
import { validateEmail, validatePassword } from "@/lib/validation";

export function RegisterPage() {
    const navigate = useNavigate();
    const signupMutation = useSignupMutation();
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        const nextFieldErrors: Record<string, string> = {};
        const emailError = validateEmail(email);
        if (emailError) nextFieldErrors.email = emailError;

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
                <div className="form-field">
                    <label htmlFor="name">Full name</label>
                    <input
                        id="name"
                        name="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        placeholder="Jane Doe"
                        required
                        disabled={signupMutation.isPending}
                    />
                </div>
                <div className="form-field">
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        name="email"
                        type="text"
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        placeholder="you@company.com"
                        required
                        disabled={signupMutation.isPending}
                        aria-invalid={fieldErrors.email ? true : undefined}
                    />
                    {fieldErrors.email && (
                        <p className="form-field-error">{fieldErrors.email}</p>
                    )}
                </div>
                <PasswordField
                    id="password"
                    name="password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                    showRules
                    disabled={signupMutation.isPending}
                />
                {fieldErrors.password && (
                    <p className="form-field-error">{fieldErrors.password}</p>
                )}
                <PasswordField
                    id="confirmPassword"
                    name="confirmPassword"
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    disabled={signupMutation.isPending}
                />
                {fieldErrors.confirmPassword && (
                    <p className="form-field-error">{fieldErrors.confirmPassword}</p>
                )}
                {error && <p className="form-message error">{error}</p>}
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
