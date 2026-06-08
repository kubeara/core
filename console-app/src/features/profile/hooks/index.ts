import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, getErrorMessage, toApiError } from "@/api/api-error";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { QUERY_KEYS } from "@/constants/query-keys";
import {
    changeProfilePassword,
    updateGeneralProfile,
    updateOrganizationProfile,
} from "../api";
import type {
    ChangePasswordRequest,
    ChangePasswordResponse,
    UpdateGeneralProfileRequest,
    UpdateOrganizationRequest,
} from "../types";
import type { User } from "@/types";

function syncUserInCache(
    queryClient: ReturnType<typeof useQueryClient>,
    user: User,
) {
    queryClient.setQueryData(QUERY_KEYS.auth.me, user);
}

function withProfileMutationError<TData, TVariables>(
    mutationFn: (variables: TVariables) => Promise<TData>,
): (variables: TVariables) => Promise<TData> {
    return async (variables: TVariables) => {
        try {
            return await mutationFn(variables);
        } catch (error) {
            throw toApiError(error);
        }
    };
}

export function useUpdateGeneralProfileMutation() {
    const queryClient = useQueryClient();

    return useMutation<
        { user: User; message: string },
        ApiError,
        UpdateGeneralProfileRequest
    >({
        mutationFn: withProfileMutationError(updateGeneralProfile),
        onSuccess: ({ user, message }) => {
            syncUserInCache(queryClient, user);
            showSuccessToast(message);
        },
        onError: (error) => {
            showErrorToast(getErrorMessage(error));
        },
    });
}

export function useChangeProfilePasswordMutation() {
    return useMutation<
        ChangePasswordResponse,
        ApiError,
        ChangePasswordRequest
    >({
        mutationFn: withProfileMutationError(changeProfilePassword),
        onSuccess: ({ message }) => {
            showSuccessToast(message);
        },
        onError: (error) => {
            showErrorToast(getErrorMessage(error));
        },
    });
}

export function useUpdateOrganizationMutation() {
    const queryClient = useQueryClient();

    return useMutation<User, ApiError, UpdateOrganizationRequest>({
        mutationFn: withProfileMutationError(updateOrganizationProfile),
        onSuccess: (user) => {
            syncUserInCache(queryClient, user);
            showSuccessToast("Organization updated successfully");
        },
        onError: (error) => {
            showErrorToast(getErrorMessage(error));
        },
    });
}
