import { useMemo } from "react";
import { FormFieldLabel } from "@/components/shared/form-field-label";
import { PasswordInput } from "@/components/shared/password-input";
import { getPasswordRuleResults } from "@/lib/validation";
import "./password-field.css";

type PasswordFieldProps = {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
  showRules?: boolean;
  required?: boolean;
  error?: string | null;
};

export function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
  showRules = false,
  required = true,
  error,
}: PasswordFieldProps) {
  const rules = useMemo(() => getPasswordRuleResults(value), [value]);
  const showRuleList = showRules && value.length > 0;

  const describedBy = [
    showRuleList ? `${id}-rules` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="form-field password-field">
      <FormFieldLabel htmlFor={id} required={required}>
        {label}
      </FormFieldLabel>
      <PasswordInput
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {showRuleList && (
        <ul id={`${id}-rules`} className="password-rules" aria-live="polite">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className={rule.passed ? "password-rule-pass" : "password-rule-fail"}
            >
              <span className="password-rule-icon" aria-hidden>
                {rule.passed ? "✓" : "○"}
              </span>
              {rule.label}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className="form-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
