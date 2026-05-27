type Field = {
    id: string;
    label: string;
    type: string;
    autoComplete?: string;
    placeholder?: string;
};

type AuthFormProps = {
    fields: Field[];
    submitLabel: string;
    onSubmit: (formData: FormData) => Promise<void>;
    error?: string | null;
    success?: string | null;
    loading?: boolean;
    children?: React.ReactNode;
};

/**
 * Reusable authentication form component.
 * 
 * Features:
 * - Dynamic field rendering
 * - Error and success message display
 * - Loading state with disabled inputs
 * - Form submission handling
 * 
 * @param fields - Array of form fields to render
 * @param submitLabel - Text for submit button
 * @param onSubmit - Form submission handler
 * @param error - Error message to display
 * @param success - Success message to display
 * @param loading - Whether form is submitting
 * @param children - Additional content (e.g., forgot password link)
 */
export function AuthForm({
    fields,
    submitLabel,
    onSubmit,
    error,
    success,
    loading,
    children,
}: AuthFormProps) {
    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        await onSubmit(formData);
    }

    return (
        <form onSubmit={handleSubmit} className="auth-form">
            {fields.map((field) => (
                <div key={field.id} className="form-field">
                    <label htmlFor={field.id}>{field.label}</label>
                    <input
                        id={field.id}
                        name={field.id}
                        type={field.type}
                        autoComplete={field.autoComplete}
                        placeholder={field.placeholder}
                        required
                        disabled={loading}
                    />
                </div>
            ))}
            {error && <p className="form-message error">{error}</p>}
            {success && <p className="form-message success">{success}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Please wait…" : submitLabel}
            </button>
            {children}
        </form>
    );
}
