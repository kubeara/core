import { isAxiosError } from "axios";
import { apiClient } from "@/api/axios";
import type { User } from "@/types";
import {
    getAccessToken,
    hasStoredSession,
    hydrateTokensFromStorage,
} from "../utils/token-manager";
import type {
    AuthApiResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    VerifyOtpRequest,
} from "../types";

/**
 * Sign up a new user account.
 * 
 * @param input - User registration data (name, email, password)
 * @returns The created user object
 * @throws {ApiError} If signup fails (e.g., email already exists)
 * 
 * @example
 * const user = await signup({
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   password: 'securePassword123'
 * });
 */
export async function signup(input: SignupRequest): Promise<User> {
    const response = await apiClient.post<AuthApiResponse<SignupResponse>>(
        "/auth/signup",
        input,
    );
    const userData = response.data.data;
    if (!userData) {
        throw new Error("No user data in signup response");
    }
    return userData as User;
}

/**
 * Log in an existing user.
 * 
 * On successful login:
 * - Stores access and refresh tokens in memory
 * - Returns user data and tokens
 * 
 * @param input - Login credentials (email, password)
 * @returns Object containing user, accessToken, and refreshToken
 * @throws {ApiError} If login fails (e.g., invalid credentials)
 * 
 * @example
 * const { user, accessToken, refreshToken } = await login({
 *   email: 'john@example.com',
 *   password: 'securePassword123'
 * });
 */
export async function login(
    input: LoginRequest,
): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const response = await apiClient.post<AuthApiResponse<LoginResponse>>(
        "/auth/login",
        input,
    );
    const data = response.data.data;
    if (!data) {
        throw new Error("No data in login response");
    }

    // Store tokens in the API client for subsequent requests
    apiClient.setTokens(data.accessToken, data.refreshToken);

    return {
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
    };
}

/**
 * Get the currently authenticated user's profile.
 * 
 * This endpoint is used to:
 * - Restore user session on app load
 * - Verify authentication status
 * - Refresh user data
 * 
 * @returns The current user object, or null if not authenticated
 * @throws {ApiError} If request fails (except for 401 which returns null)
 * 
 * @example
 * const user = await getCurrentUser();
 * if (user) {
 *   console.log('Logged in as:', user.name);
 * } else {
 *   console.log('Not authenticated');
 * }
 */
export async function getCurrentUser(): Promise<User | null> {
    hydrateTokensFromStorage();

    if (!hasStoredSession() && !getAccessToken()) {
        return null;
    }

    try {
        const response = await apiClient.get<AuthApiResponse<User>>("/auth/me");
        return response.data.data ?? null;
    } catch (error: unknown) {
        if (isAxiosError(error) && error.response?.status === 401) {
            if (hasStoredSession() || getAccessToken()) {
                apiClient.clearTokens();
            }
            return null;
        }
        throw error;
    }
}

/**
 * Log out the current user.
 * 
 * This will:
 * - Call the backend logout endpoint
 * - Clear tokens from memory
 * - Invalidate the session
 * 
 * Note: Tokens are cleared even if the API call fails.
 * 
 * @example
 * await logout();
 * // User is now logged out
 */
export async function logout(): Promise<void> {
    try {
        await apiClient.post<AuthApiResponse>("/auth/logout");
    } finally {
        // Always clear tokens, even if logout API call fails
        apiClient.clearTokens();
    }
}

/**
 * Request a password reset OTP to be sent to the user's email.
 * 
 * @param input - Object containing the user's email
 * @returns Success message
 * @throws {ApiError} If request fails (e.g., email not found)
 * 
 * @example
 * const result = await forgotPassword({ email: 'john@example.com' });
 * console.log(result.message); // "OTP sent to your email"
 */
export async function forgotPassword(
    input: ForgotPasswordRequest,
): Promise<MessageResponse> {
    const response = await apiClient.post<AuthApiResponse>(
        "/auth/forgot-password",
        input,
    );
    return { message: response.data.message };
}

/**
 * Verify the OTP code sent to the user's email.
 * 
 * @param input - Email and OTP code
 * @returns Success message
 * @throws {ApiError} If OTP is invalid or expired
 * 
 * @example
 * const result = await verifyOtp({
 *   email: 'john@example.com',
 *   otp: '123456'
 * });
 */
export async function verifyOtp(
    input: VerifyOtpRequest,
): Promise<MessageResponse> {
    const response = await apiClient.post<AuthApiResponse>(
        "/auth/verify-otp",
        input,
    );
    return { message: response.data.message };
}

/**
 * Reset the user's password using a verified OTP.
 * 
 * @param input - Email and new password
 * @returns Success message
 * @throws {ApiError} If reset fails
 * 
 * @example
 * const result = await resetPassword({
 *   email: 'john@example.com',
 *   newPassword: 'newSecurePassword123'
 * });
 */
export async function resetPassword(
    input: ResetPasswordRequest,
): Promise<MessageResponse> {
    const response = await apiClient.post<AuthApiResponse>(
        "/auth/reset-password",
        input,
    );
    return { message: response.data.message };
}
