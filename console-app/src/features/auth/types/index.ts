import type { User } from "@/types";

/**
 * Standard API success response wrapper from backend
 */
export type AuthApiResponse<T = unknown> = {
  success?: boolean;
  statusCode?: number;
  message: string;
  data?: T;
};

/**
 * Response from login endpoint
 */
export type LoginResponse = {
  user: User;
};

/**
 * Response from signup endpoint
 */
export type SignupResponse = {
  id: string;
  name: string;
  email: string;
  organizationId: string;
};

/**
 * Request payload for signup
 */
export type SignupRequest = {
  name: string;
  email: string;
  password: string;
};

/**
 * Request payload for login
 */
export type LoginRequest = {
  email: string;
  password: string;
};

/**
 * Request payload for forgot password
 */
export type ForgotPasswordRequest = {
  email: string;
};

/**
 * Request payload for OTP verification
 */
export type OtpCodeType = "EMAIL_VERIFICATION" | "FORGOT_PASSWORD";

export type VerifyOtpRequest = {
  email: string;
  otp: string;
  purpose: OtpCodeType;
};

/**
 * Request payload for resend OTP
 */
export type ResendOtpRequest = {
  email: string;
};

/**
 * Request payload for password reset
 */
export type ResetPasswordRequest = {
  email: string;
  newPassword: string;
};

/**
 * Generic message response
 */
export type MessageResponse = {
  message: string;
};
