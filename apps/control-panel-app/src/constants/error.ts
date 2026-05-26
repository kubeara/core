export const ERROR_MESSAGES = {
  SSH: {
    SSH_INFO_REQUIRED: "ssh required",
    PASSWORD_REQUIRED: "password required for password authtype",
    PRIVATE_KEY_REQUIRED: "privateKey required for PRIVATE_KEY authType",
  },

  SERVER: {
    NOT_FOUND: "server not found",
    ALREADY_EXIST: "server with this host and username already exist",
    CREDENTIALS_NOT_FOUND: "ssh credentials not found",
  },

  AUTH: {
    EMAIL_ALREADY_EXISTS: "email already exists",
    INVALID_CREDENTIALS: "invalid email or password",
    INVALID_REFRESH_TOKEN: "invalid refresh token",
    SESSION_EXPIRED: "session expired",
    UNAUTHORIZED: "unauthorized",
    USER_NOT_FOUND: "user not found",
    OLD_SAME_PASSWORD: "new password cannot be same as old",
    INVALID_OTP: "invalid OTP",
    OTP_EXPIRED: "OTP expired",
    OTP_NOT_VERIFIED: "OTP not verified",
    MAX_OTP_ATTEMPTS: "OTP attempts exhausted, please try again later",
  },
};
