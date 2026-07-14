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
    SSH_CONNECTION_FAILED:
      "Unable to connect to the server. The SSH connection failed.",
    SSH_TEST_FAILED: "SSH connection test failed",
    CONNECTION_TIMEOUT: "Connection timed out",
    ALREADY_CONNECTED: "Server is already connected",
    CONNECTION_FAILED: "Failed to connect to server",
    DELETE_FAILED: "Failed to delete server",
    OPERATION_IN_PROGRESS: "Server setup is still in progress",
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
    SSH_LOCAL_UNAVAILABLE:
      "SSH terminal fallback is not available for local servers without an agent",
    SSH_SHELL_FAILED: "SSH shell failed",
    UNKNOWN_ERROR: "unknown error",
  },

  CONTAINER: {
    KUBEARA_AGENT_DELETE_FORBIDDEN:
      "The Kubeara Agent is required to manage this server and cannot be deleted",
  },

  CONTAINER_LOGS: {
    AGENT_UNAVAILABLE:
      "Container logs are unavailable. Connect the agent on this server first.",
    AGENT_UNSUPPORTED:
      "Connected agent does not support container logs. Update the agent.",
    SESSION_NOT_FOUND: "Container logs session not found",
    START_FAILED: "Failed to start container log stream",
    STOP_FAILED: "Failed to stop container log stream",
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
    EMAIL_NOT_VERIFIED: "Email not verified",
    OTP_EXPIRED_OR_INVALID: "OTP expired or invalid",
    OTP_RESEND_LIMIT_REACHED:
      "You have reached the resend limit. Try again after {minutes} minutes.",
  },

  PROFILE: {
    INVALID_CURRENT_PASSWORD: "Current password is incorrect",
  },

  MCP_API_KEYS: {
    NOT_FOUND: "MCP API key not found",
    INVALID_TOKEN: "Invalid MCP API key",
    MISSING_AUTHORIZATION: "Missing Authorization header",
  },

  ACTIVITY: {
    NOT_FOUND: "Activity not found",
  },

  MCP_SERVER: {
    METHOD_NOT_ALLOWED: "Method not allowed.",
    INTERNAL_SERVER_ERROR: "Internal server error",
  },

  MCP_OAUTH: {
    INVALID_RESPONSE_TYPE: "Unsupported response_type",
    INVALID_AUTHORIZE_REQUEST: "Invalid OAuth authorization request",
    UNSUPPORTED_CODE_CHALLENGE: "Only S256 code challenge is supported",
    INVALID_CLIENT_ID: "Unsupported OAuth client",
    INVALID_CIMD_CLIENT_ID: "Invalid ChatGPT client metadata document",
    CIMD_FETCH_FAILED: "Failed to fetch ChatGPT client metadata document",
    CIMD_REDIRECT_URI_MISMATCH:
      "OAuth redirect URI is not allowed for this ChatGPT client",
    INVALID_REDIRECT_URI: "Invalid OAuth redirect URI",
    INVALID_RESOURCE: "Invalid OAuth resource parameter",
    INVALID_GRANT_TYPE: "Unsupported grant_type",
    INVALID_TOKEN_REQUEST: "Invalid OAuth token request",
    INVALID_AUTHORIZATION_CODE: "Invalid authorization code",
    AUTHORIZATION_CODE_EXPIRED: "Authorization code expired",
    INVALID_CODE_VERIFIER: "Invalid PKCE code verifier",
    INVALID_REFRESH_TOKEN: "Invalid refresh token",
    REFRESH_TOKEN_EXPIRED: "Refresh token expired",
    INVALID_ACCESS_TOKEN: "Invalid MCP OAuth access token",
  },
};
