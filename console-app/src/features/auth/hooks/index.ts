import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { queryClient } from "@/api/query-client";
import { QUERY_KEYS } from "@/constants/query-keys";
import { toApiError } from "@/api/api-error";
import { beginLogout } from "../utils/session-manager";
import {
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  logoutAllDevices,
  resetPassword,
  resendOtp,
  signup,
  verifyOtp,
} from "../api";
import type {
  ForgotPasswordRequest,
  LoginRequest,
  ResetPasswordRequest,
  ResendOtpRequest,
  SignupRequest,
  VerifyOtpRequest,
} from "../types";

export async function clearAuthUserCache(): Promise<void> {
  await queryClient.cancelQueries({ queryKey: QUERY_KEYS.auth.me });
  queryClient.setQueryData(QUERY_KEYS.auth.me, null);
  queryClient.removeQueries({ queryKey: QUERY_KEYS.auth.me });
}

export function useCurrentUserQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.auth.me,
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    ...options,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginRequest) => login(input),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEYS.auth.me, data.user);
    },
    onError: (error) => {
      throw toApiError(error);
    },
  });
}

export function useSignupMutation() {
  return useMutation({
    mutationFn: (input: SignupRequest) => signup(input),
    onError: (error) => {
      throw toApiError(error);
    },
  });
}

function createLogoutMutation(
  queryClient: QueryClient,
  mutationFn: () => Promise<void>,
) {
  return {
    mutationFn,
    onMutate: async () => {
      beginLogout();
      await clearAuthUserCache();
    },
        onSuccess: () => {
            queryClient.clear();
        },
    onError: (error: unknown) => {
      throw toApiError(error);
    },
  };
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation(createLogoutMutation(queryClient, logout));
}

export function useLogoutAllDevicesMutation() {
  const queryClient = useQueryClient();

  return useMutation(createLogoutMutation(queryClient, logoutAllDevices));
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (input: ForgotPasswordRequest) => forgotPassword(input),
    onError: (error) => {
      throw toApiError(error);
    },
  });
}

export function useResendOtpMutation() {
  return useMutation({
    mutationFn: (input: ResendOtpRequest) => resendOtp(input),
    onError: (error) => {
      throw toApiError(error);
    },
  });
}

export function useVerifyOtpMutation() {
  return useMutation({
    mutationFn: (input: VerifyOtpRequest) => verifyOtp(input),
    onError: (error) => {
      throw toApiError(error);
    },
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (input: ResetPasswordRequest) => resetPassword(input),
    onError: (error) => {
      throw toApiError(error);
    },
  });
}
