/** localStorage key for the persisted access token */
export const ACCESS_TOKEN_KEY = "kubeara_access_token";

/** localStorage key for the persisted refresh token */
export const REFRESH_TOKEN_KEY = "kubeara_refresh_token";

/** Auth endpoints that must not trigger the 401 refresh interceptor */
export const AUTH_ENDPOINTS_WITHOUT_REFRESH = [
    "/auth/login",
    "/auth/signup",
    "/auth/refresh-token",
    "/auth/forgot-password",
    "/auth/verify-otp",
    "/auth/reset-password",
] as const;
