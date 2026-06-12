export const ERROR_MESSAGES = {
  SSH: {
    SSH_INFO_REQUIRED: "SSH credentials are required",
    PASSWORD_REQUIRED: "Password is required for password authentication",
    PRIVATE_KEY_REQUIRED: "Private key is required for key authentication",
  },

  SERVER: {
    NOT_FOUND: "Server not found",
    ALREADY_EXIST: "A server with this host and username already exists",
    CREDENTIALS_NOT_FOUND: "SSH credentials not found",
    SSH_PAYLOAD_REQUIRED: "SSH credentials are required",
    SSH_CONNECTION_FAILED: "SSH connection failed",
    SSH_TEST_FAILED: "SSH connection test failed",
    CONNECTION_TIMEOUT: "Connection timed out",
    ALREADY_CONNECTED: "Server is already connected",
    CONNECTION_FAILED: "Failed to connect to server",
    DELETE_FAILED: "Failed to delete server",
    HOST_ALREADY_EXISTS: "A server with this host and port already exists",
    AGENT_CREDENTIALS_MISSING:
      "No SSH credentials for this server. Onboard the server first.",
    INACTIVE_OR_MISSING: "Server not found or inactive",
    LOCAL_SERVER_NOT_FOUND:
      "No local server yet. Deploy with deployOnLocal=true to create one.",
  },

  TERMINAL: {
    AGENT_UNAVAILABLE:
      "Terminal is unavailable. Connect the agent on this server first.",
    AGENT_UNSUPPORTED:
      "Connected agent does not support terminal access. Update the agent.",
    SESSION_NOT_FOUND: "Terminal session not found",
    CONNECT_FAILED: "Failed to create terminal session",
    DISCONNECT_FAILED: "Failed to disconnect terminal session",
  },

  AUTH: {
    EMAIL_ALREADY_EXISTS: "Email already exists",
    INVALID_CREDENTIALS: "Invalid email or password",
    INVALID_REFRESH_TOKEN: "Invalid refresh token",
    SESSION_EXPIRED: "Session expired",
    UNAUTHORIZED: "Unauthorized",
    USER_NOT_FOUND: "User not found",
    OLD_SAME_PASSWORD: "New password cannot be same as old",
    INVALID_OTP: "Invalid OTP",
    OTP_EXPIRED: "OTP expired",
    OTP_NOT_VERIFIED: "OTP not verified",
    MAX_OTP_ATTEMPTS: "OTP attempts exhausted, please try again later",
  },

  PROFILE: {
    INVALID_CURRENT_PASSWORD: "Current password is incorrect",
  },
};
