export const OTP_EMAIL_COPY = {
  HEADER_SUBTITLE: "Secure one-time verification",
  CODE_LABEL: "Your verification code",
  INSTRUCTION_PREFIX: "Use the code below to complete your",
  VALIDITY_NOTE:
    "This code is valid for a limited time and can only be used once.",
  DISCLAIMER:
    "Enter this code in the app to continue. If you did not request this, you can safely ignore this email. Your account will remain unchanged.",
  FOOTER_PREFIX: "This is an automated message from",
  FOOTER_SUFFIX: "Please do not reply to this email.",
  GREETING_FALLBACK: "Hi there,",
} as const;

export const EMAIL_ERROR_MESSAGES = {
  NOT_CONFIGURED: "Email service is not configured.",
} as const;
