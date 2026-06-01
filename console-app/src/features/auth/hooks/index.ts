import {
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/query-keys";
import { toApiError } from "@/api/api-error";
import {
    forgotPassword,
    getCurrentUser,
    login,
    logout,
    resetPassword,
    signup,
    verifyOtp,
} from "../api";
import type {
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignupRequest,
    VerifyOtpRequest,
} from "../types";

/**
 * Query hook to fetch the current authenticated user.
 * 
 * This is the source of truth for authentication state.
 * - Returns user data if authenticated
 * - Returns null if not authenticated
 * - Used by AuthContext to provide auth state to the app
 * 
 * Configuration:
 * - retry: false - Don't retry on 401 (not authenticated)
 * - staleTime: 5 minutes - User data is fresh for 5 minutes
 * 
 * @param options - Optional query configuration
 * @returns TanStack Query result with user data or null
 * 
 * @example
 * function MyComponent() {
 *   const { data: user, isPending } = useCurrentUserQuery();
 *   
 *   if (isPending) return <div>Loading...</div>;
 *   if (!user) return <div>Not logged in</div>;
 *   return <div>Welcome, {user.name}!</div>;
 * }
 */
export function useCurrentUserQuery(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: QUERY_KEYS.auth.me,
        queryFn: getCurrentUser,
        retry: false,
        staleTime: 1000 * 60 * 5, // 5 minutes
        ...options,
    });
}

/**
 * Mutation hook for user login.
 * 
 * On success:
 * - Stores tokens in API client
 * - Updates auth query cache with user data
 * - Triggers re-render of components using useAuth()
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function LoginForm() {
 *   const loginMutation = useLoginMutation();
 *   
 *   const handleSubmit = async (data) => {
 *     try {
 *       await loginMutation.mutateAsync(data);
 *       navigate('/dashboard');
 *     } catch (error) {
 *       console.error('Login failed:', error.message);
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useLoginMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: LoginRequest) => login(input),
        onSuccess: (data) => {
            // Update the current user cache with logged-in user
            queryClient.setQueryData(QUERY_KEYS.auth.me, data.user);
        },
        onError: (error) => {
            throw toApiError(error);
        },
    });
}

/**
 * Mutation hook for user signup/registration.
 * 
 * On success:
 * - Updates auth query cache with new user data
 * - User is automatically logged in
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function SignupForm() {
 *   const signupMutation = useSignupMutation();
 *   
 *   const handleSubmit = async (data) => {
 *     try {
 *       await signupMutation.mutateAsync(data);
 *       navigate('/dashboard');
 *     } catch (error) {
 *       console.error('Signup failed:', error.message);
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useSignupMutation() {
    return useMutation({
        mutationFn: (input: SignupRequest) => signup(input),
        onError: (error) => {
            throw toApiError(error);
        },
    });
}

/**
 * Mutation hook for user logout.
 * 
 * On success:
 * - Clears tokens from API client
 * - Sets auth query cache to null
 * - Clears all query cache (for security)
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function LogoutButton() {
 *   const logoutMutation = useLogoutMutation();
 *   
 *   const handleLogout = async () => {
 *     try {
 *       await logoutMutation.mutateAsync();
 *       navigate('/login');
 *     } catch (error) {
 *       console.error('Logout failed:', error.message);
 *     }
 *   };
 *   
 *   return <button onClick={handleLogout}>Logout</button>;
 * }
 */
export function useLogoutMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: logout,
        onSuccess: () => {
            // Clear user from cache
            queryClient.setQueryData(QUERY_KEYS.auth.me, null);

            // Clear all cached data for security
            queryClient.clear();
        },
        onError: (error) => {
            throw toApiError(error);
        },
    });
}

/**
 * Mutation hook for requesting a password reset OTP.
 * 
 * Sends an OTP code to the user's email address.
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function ForgotPasswordForm() {
 *   const forgotPasswordMutation = useForgotPasswordMutation();
 *   
 *   const handleSubmit = async (email) => {
 *     try {
 *       const result = await forgotPasswordMutation.mutateAsync({ email });
 *       alert(result.message);
 *     } catch (error) {
 *       console.error('Failed to send OTP:', error.message);
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useForgotPasswordMutation() {
    return useMutation({
        mutationFn: (input: ForgotPasswordRequest) => forgotPassword(input),
        onError: (error) => {
            throw toApiError(error);
        },
    });
}

/**
 * Mutation hook for verifying an OTP code.
 * 
 * Verifies the OTP sent to the user's email.
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function VerifyOtpForm() {
 *   const verifyOtpMutation = useVerifyOtpMutation();
 *   
 *   const handleSubmit = async (data) => {
 *     try {
 *       await verifyOtpMutation.mutateAsync(data);
 *       navigate('/reset-password');
 *     } catch (error) {
 *       console.error('Invalid OTP:', error.message);
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useVerifyOtpMutation() {
    return useMutation({
        mutationFn: (input: VerifyOtpRequest) => verifyOtp(input),
        onError: (error) => {
            throw toApiError(error);
        },
    });
}

/**
 * Mutation hook for resetting password with OTP.
 * 
 * Resets the user's password after OTP verification.
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function ResetPasswordForm() {
 *   const resetPasswordMutation = useResetPasswordMutation();
 *   
 *   const handleSubmit = async (data) => {
 *     try {
 *       await resetPasswordMutation.mutateAsync(data);
 *       navigate('/login');
 *     } catch (error) {
 *       console.error('Password reset failed:', error.message);
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useResetPasswordMutation() {
    return useMutation({
        mutationFn: (input: ResetPasswordRequest) => resetPassword(input),
        onError: (error) => {
            throw toApiError(error);
        },
    });
}
