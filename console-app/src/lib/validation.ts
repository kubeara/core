export const INVALID_EMAIL_MESSAGE = "Invalid email address";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && EMAIL_PATTERN.test(trimmed);
}

export function validateEmail(value: string): string | null {
  if (!value.trim()) {
    return "Email is required.";
  }
  if (!isValidEmail(value)) {
    return INVALID_EMAIL_MESSAGE;
  }
  return null;
}

export type PasswordRuleId =
  | "minLength"
  | "hasLetter"
  | "hasNumber"
  | "hasSpecial";

export type PasswordRule = {
  id: PasswordRuleId;
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "minLength",
    label: "At least 8 characters",
    test: (p) => p.length >= 8,
  },
  {
    id: "hasLetter",
    label: "At least 1 letter",
    test: (p) => /[a-zA-Z]/.test(p),
  },
  {
    id: "hasNumber",
    label: "At least 1 number",
    test: (p) => /\d/.test(p),
  },
  {
    id: "hasSpecial",
    label: "At least 1 special character",
    test: (p) => /[^a-zA-Z0-9]/.test(p),
  },
];

export function getPasswordRuleResults(password: string) {
  return PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(password),
  }));
}

export function validatePassword(password: string): string | null {
  const failed = PASSWORD_RULES.find((rule) => !rule.test(password));
  return failed ? failed.label : null;
}

/** Normalize backend / browser validation messages for consistent UX. */
export function normalizeValidationMessage(message: string): string {
  const lower = message.toLowerCase().trim();
  if (
    lower === "email must be email" ||
    lower === "email must be an email" ||
    lower.includes("must be an email")
  ) {
    return INVALID_EMAIL_MESSAGE;
  }
  return message;
}

export function normalizeValidationMessages(messages: string): string {
  return messages
    .split(",")
    .map((part) => normalizeValidationMessage(part.trim()))
    .join(", ");
}
