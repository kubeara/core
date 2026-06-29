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
    SIGNUP: "User registered successfully",
    LOGIN: "User logged in successfully",
    REFRESH: "Tokens refreshed successfully",
    LOGOUT: "User logged out successfully",
    LOGOUT_ALL: "Logged out from all devices successfully",
    PROFILE: "Profile fetched successfully",
    RESET_PASSWORD: "Password updated successfully",
    OTP_SENT: "OTP sent successfully",
    OTP_VERIFIED: "OTP verified successfully",
    PASSWORD_RESET: "Password updated successfully",
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
