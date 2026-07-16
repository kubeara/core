export const API_ERROR_MESSAGES = {
  GENERIC: "Something went wrong. Please try again later.",
  NETWORK: "Network error. Please check your connection and try again.",
  REQUEST_CANCELED: "Request was canceled.",
  SESSION_EXPIRED: "Your session has expired. Please sign in again.",
  FORBIDDEN: "You do not have permission to perform this action.",
  TOO_MANY_REQUESTS: "Too many requests. Please try again later.",
  REQUEST_FAILED: "Request failed",
} as const;
