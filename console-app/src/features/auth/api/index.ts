import { isAxiosError } from "axios";
import { apiClient } from "@/api/axios";
import type { User } from "@/types";
import {
  beginLogout,
  clearSessionState,
  isAuthFetchEnabled,
  markSessionAuthenticated,
} from "../utils/session-manager";
import type {
  AuthApiResponse,
  ForgotPasswordRequest,
  LoginRequest,
  MessageResponse,
  ResetPasswordRequest,
  ResendOtpRequest,
  SignupRequest,
  SignupResponse,
  VerifyOtpRequest,
} from "../types";
import { AUTH_TOAST_MESSAGES } from "../constants";

const GENERIC_SUCCESS_MESSAGE = "Request completed successfully";

function getAuthMessage(
  response: AuthApiResponse,
  fallback: string,
): string {
  const message = response.message?.trim();
  if (!message || message === GENERIC_SUCCESS_MESSAGE) {
    return fallback;
  }
  return message;
}

export async function signup(input: SignupRequest): Promise<User> {
  const response = await apiClient.post<AuthApiResponse<SignupResponse>>(
    "/auth/signup",
    input,
  );
  const userData = response.data.data;
  if (!userData) {
    throw new Error("No user data in signup response");
  }
  return userData;
}

export async function login(input: LoginRequest): Promise<{ user: User }> {
  const response = await apiClient.post<AuthApiResponse<{ user: User }>>(
    "/auth/login",
    input,
  );
  const data = response.data.data;
  if (!data?.user) {
    throw new Error("No user data in login response");
  }

  markSessionAuthenticated();

  return { user: data.user };
}

export async function getCurrentUser(): Promise<User | null> {
  if (!isAuthFetchEnabled()) {
    return null;
  }

  try {
    const response = await apiClient.get<AuthApiResponse<User>>("/auth/me");
    return response.data.data ?? null;
  } catch (error: unknown) {
    if (isAxiosError(error) && error.response?.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  beginLogout();

  try {
    await apiClient.post<AuthApiResponse>("/auth/logout");
  } finally {
    clearSessionState();
  }
}

export async function logoutAllDevices(): Promise<void> {
  beginLogout();

  try {
    await apiClient.post<AuthApiResponse>("/auth/logout-all");
  } finally {
    clearSessionState();
  }
}

export async function forgotPassword(
  input: ForgotPasswordRequest,
): Promise<MessageResponse> {
  const response = await apiClient.post<AuthApiResponse>(
    "/auth/forgot-password",
    input,
  );
  return { message: getAuthMessage(response.data, AUTH_TOAST_MESSAGES.OTP_SENT) };
}

export async function resendOtp(
  input: ResendOtpRequest,
): Promise<MessageResponse> {
  const response = await apiClient.post<AuthApiResponse>(
    "/auth/resend-otp",
    input,
  );
  return {
    message: getAuthMessage(response.data, AUTH_TOAST_MESSAGES.OTP_RESENT),
  };
}

export async function verifyOtp(
  input: VerifyOtpRequest,
): Promise<MessageResponse> {
  const response = await apiClient.post<AuthApiResponse>(
    "/auth/verify-otp",
    input,
  );
  const fallback =
    input.purpose === "EMAIL_VERIFICATION"
      ? AUTH_TOAST_MESSAGES.EMAIL_VERIFIED
      : AUTH_TOAST_MESSAGES.RESET_CODE_VERIFIED;
  return { message: getAuthMessage(response.data, fallback) };
}

export async function resetPassword(
  input: ResetPasswordRequest,
): Promise<MessageResponse> {
  const response = await apiClient.post<AuthApiResponse>(
    "/auth/reset-password",
    input,
  );
  return {
    message: getAuthMessage(response.data, AUTH_TOAST_MESSAGES.PASSWORD_RESET),
  };
}
