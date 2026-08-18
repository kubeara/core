export const SUCCESS_MESSAGES = {
  SERVER: {
    CREATED: "Server created successfully",
    RESTORED: "Server restored successfully",
    LIST: "Servers fetched successfully",
    FETCHED: "Server fetched successfully",
    UPDATED: "Server updated successfully",
    CONNECTED: "Server connected successfully",
    DISCONNECTED: "Server disconnected successfully",
    DELETED: "Server deleted successfully",
    DELETE_STARTED: "Server removal started",
  },

  TERMINAL: {
    CONNECTED: "Terminal session created successfully",
    SSH_CONNECTED: "Terminal session created via SSH fallback",
    DISCONNECTED: "Terminal session disconnected successfully",
  },

  CONTAINER_LOGS: {
    STARTED: "Container log stream started successfully",
    STOPPED: "Container log stream stopped successfully",
  },

  AUTH: {
    SIGNUP: "Account created. Check your email for a verification code.",
    SIGNUP_SELF_HOST: "Account created. You can sign in now.",
    LOGIN: "User logged in successfully",
    REFRESH: "Tokens refreshed successfully",
    LOGOUT: "User logged out successfully",
    LOGOUT_ALL: "Logged out from all devices successfully",
    PROFILE: "Profile fetched successfully",
    RESET_PASSWORD: "Password updated successfully",
    OTP_SENT: "Verification code sent to your email.",
    OTP_RESENT: "A new verification code has been sent to your email.",
    EMAIL_VERIFIED: "Your email has been verified. You can sign in now.",
    EMAIL_ALREADY_VERIFIED: "Your email is already verified. You can sign in.",
    EMAIL_VERIFICATION_NOT_REQUIRED:
      "Email verification is not required. You can sign in.",
    RESET_CODE_VERIFIED: "Code verified. You can set a new password.",
    PASSWORD_RESET: "Your password has been updated. You can sign in now.",
  },

  PROFILE: {
    UPDATED: "Profile updated successfully",
    PASSWORD_CHANGED: "Password updated successfully",
  },

  MCP_API_KEYS: {
    CREATED: "MCP API key created successfully",
    LIST: "MCP API keys fetched successfully",
    REVOKED: "MCP API key revoked successfully",
  },

  ACTIVITY: {
    LIST: "Activities fetched successfully",
    DETAIL: "Activity fetched successfully",
  },

  TEMPLATE: {
    LIST: "Templates fetched successfully",
    CATEGORIES: "Template categories fetched successfully",
  },
  SUBSCRIPTIONS: {
    PLANS: "Plans fetched successfully",
    CURRENT: "Subscription fetched successfully",
    CHECKOUT: "Checkout session created successfully",
    PLAN_CHANGED: "Plan changed successfully",
    CANCELED: "Subscription canceled successfully",
    CONFIRMED: "Subscription confirmed successfully",
    PENDING_DOWNGRADE_CANCELED:
      "Scheduled plan change canceled. Your current plan will continue.",
    INVOICES: "Invoices fetched successfully",
  },
};
