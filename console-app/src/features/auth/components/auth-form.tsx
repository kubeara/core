import { FormErrorsSummary } from "@/components/shared/form-errors-summary";
import { FormFieldLabel } from "@/components/shared/form-field-label";
import { PasswordInput } from "@/components/shared/password-input";

type Field = {
  id: string;
  label: string;
  type: string;
  autoComplete?: string;
  placeholder?: string;
  /** When true, runs client-side email validation instead of browser defaults. */
  validateAsEmail?: boolean;
  required?: boolean;
};

type AuthFormProps = {
  fields: Field[];
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<void>;
  error?: string | null;
  errorAfterFields?: boolean;
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
  errorAfterFields = false,
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
      {!errorAfterFields && <FormErrorsSummary formError={error} />}
      {fields.map((field) => {
        const inputType = field.validateAsEmail ? "text" : field.type;
        const inputMode = field.validateAsEmail ? "email" : undefined;
        const fieldError = fieldErrors[field.id];
        const isRequired = field.required ?? true;
        const isPassword = field.type === "password";

        return (
          <div key={field.id} className="form-field">
            <FormFieldLabel htmlFor={field.id} required={isRequired}>
              {field.label}
            </FormFieldLabel>
            {isPassword ? (
              <PasswordInput
                id={field.id}
                name={field.id}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                disabled={loading}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? `${field.id}-error` : undefined}
              />
            ) : (
              <input
                id={field.id}
                name={field.id}
                type={inputType}
                inputMode={inputMode}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                disabled={loading}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? `${field.id}-error` : undefined}
              />
            )}
            {fieldError && (
              <p
                id={`${field.id}-error`}
                className="form-field-error"
                role="alert"
              >
                {fieldError}
              </p>
            )}
          </div>
        );
      })}
      {errorAfterFields && <FormErrorsSummary formError={error} />}
      {success && <p className="form-message success">{success}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? "Please wait…" : submitLabel}
      </button>
      {children}
    </form>
  );
}
