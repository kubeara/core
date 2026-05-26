import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  changeProfilePassword,
  updateGeneralProfile,
  updateOrganizationProfile,
} from "@/api/profile-api";
import { queryKeys } from "@/api/query-keys";

function syncUserInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  user: Awaited<ReturnType<typeof updateGeneralProfile>>,
) {
  queryClient.setQueryData(queryKeys.auth.me, user);
}

export function useUpdateGeneralProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateGeneralProfile,
    onSuccess: (user) => syncUserInCache(queryClient, user),
  });
}

export function useChangeProfilePasswordMutation() {
  return useMutation({
    mutationFn: changeProfilePassword,
  });
}

export function useUpdateOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateOrganizationProfile,
    onSuccess: (user) => syncUserInCache(queryClient, user),
  });
}
