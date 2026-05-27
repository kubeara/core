import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/query-keys";
import {
    changeProfilePassword,
    updateGeneralProfile,
    updateOrganizationProfile,
} from "../api";
import type {
    ChangePasswordRequest,
    UpdateGeneralProfileRequest,
    UpdateOrganizationRequest,
} from "../types";
import type { User } from "@/types";

/**
 * Sync updated user data to the auth query cache.
 * This ensures the user data is consistent across the app.
 */
function syncUserInCache(
    queryClient: ReturnType<typeof useQueryClient>,
    user: User,
) {
    queryClient.setQueryData(QUERY_KEYS.auth.me, user);
}

/**
 * Mutation hook for updating general profile.
 * 
 * On success:
 * - Updates user in auth cache
 * - Triggers re-render of components using useAuth()
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function ProfileForm() {
 *   const updateMutation = useUpdateGeneralProfileMutation();
 *   
 *   const handleSubmit = async (data) => {
 *     try {
 *       await updateMutation.mutateAsync(data);
 *       alert('Profile updated!');
 *     } catch (error) {
 *       console.error('Update failed:', error.message);
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useUpdateGeneralProfileMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: UpdateGeneralProfileRequest) => updateGeneralProfile(input),
        onSuccess: (user) => syncUserInCache(queryClient, user),
    });
}

/**
 * Mutation hook for changing password.
 * 
 * Does not update user cache as password change doesn't affect user data.
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function ChangePasswordForm() {
 *   const changeMutation = useChangeProfilePasswordMutation();
 *   
 *   const handleSubmit = async (data) => {
 *     try {
 *       const result = await changeMutation.mutateAsync(data);
 *       alert(result.message);
 *     } catch (error) {
 *       console.error('Password change failed:', error.message);
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useChangeProfilePasswordMutation() {
    return useMutation({
        mutationFn: (input: ChangePasswordRequest) => changeProfilePassword(input),
    });
}

/**
 * Mutation hook for updating organization profile.
 * 
 * On success:
 * - Updates user in auth cache (includes organization data)
 * - Triggers re-render of components using useAuth()
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function OrganizationForm() {
 *   const updateMutation = useUpdateOrganizationMutation();
 *   
 *   const handleSubmit = async (data) => {
 *     try {
 *       await updateMutation.mutateAsync(data);
 *       alert('Organization updated!');
 *     } catch (error) {
 *       console.error('Update failed:', error.message);
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useUpdateOrganizationMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: UpdateOrganizationRequest) => updateOrganizationProfile(input),
        onSuccess: (user) => syncUserInCache(queryClient, user),
    });
}
