type Field = {
    id: string;
    label: string;
    type: string;
    autoComplete?: string;
    placeholder?: string;
    /** When true, runs client-side email validation instead of browser defaults. */
    validateAsEmail?: boolean;
};

type AuthFormProps = {
    fields: Field[];
    submitLabel: string;
    onSubmit: (formData: FormData) => Promise<void>;
    error?: string | null;
    success?: string | null;
    loading?: boolean;
    children?: React.ReactNode;
    fieldErrors?: Record<string, string>;
};

/**
 * Reusable authentication form component.
 */
export function AuthForm({
    fields,
    submitLabel,
    onSubmit,
    error,
    success,
    loading,
    children,
    fieldErrors = {},
}: AuthFormProps) {
    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        await onSubmit(formData);
    }

    return (
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
            {fields.map((field) => {
                const inputType = field.validateAsEmail ? "text" : field.type;
                const inputMode = field.validateAsEmail ? "email" : undefined;
                const fieldError = fieldErrors[field.id];

                return (
                    <div key={field.id} className="form-field">
                        <label htmlFor={field.id}>{field.label}</label>
                        <input
                            id={field.id}
                            name={field.id}
                            type={inputType}
                            inputMode={inputMode}
                            autoComplete={field.autoComplete}
                            placeholder={field.placeholder}
                            required
                            disabled={loading}
                            aria-invalid={fieldError ? true : undefined}
                            aria-describedby={
                                fieldError ? `${field.id}-error` : undefined
                            }
                        />
                        {fieldError && (
                            <p
                                id={`${field.id}-error`}
                                className="form-field-error"
                            >
                                {fieldError}
                            </p>
                        )}
                    </div>
                );
            })}
            {error && <p className="form-message error">{error}</p>}
            {success && <p className="form-message success">{success}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Please wait…" : submitLabel}
            </button>
            {children}
        </form>
    );
}
