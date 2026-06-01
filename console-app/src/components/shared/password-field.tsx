import { useMemo } from "react";
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
}: PasswordFieldProps) {
  const rules = useMemo(() => getPasswordRuleResults(value), [value]);
  const showRuleList = showRules && value.length > 0;

  return (
    <div className="form-field password-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-describedby={showRuleList ? `${id}-rules` : undefined}
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
    </div>
  );
}
