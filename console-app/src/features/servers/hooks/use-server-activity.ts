import { useQuery } from "@tanstack/react-query";
import { isTerminalDeploymentStatus } from "@/constants/deployment-events";
import { QUERY_KEYS } from "@/constants/query-keys";
import {
  fetchActivityDetail,
  fetchServerActivities,
} from "../api/activity";

/**
 * Lists activities for a server.
 */
export function useServerActivitiesQuery(serverId: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.activity.byServer(serverId),
    queryFn: () => fetchServerActivities(serverId),
    enabled: Boolean(serverId) && enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 15_000 : false,
  });
}

/**
 * Loads a single activity with persisted logs.
 * Polls while the activity is still in progress.
 */
export function useActivityDetailQuery(
  activityId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: QUERY_KEYS.activity.detail(activityId ?? ""),
    queryFn: () => fetchActivityDetail(activityId!),
    enabled: Boolean(activityId) && enabled,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const status = query.state.data?.operationStatus;
      return isTerminalDeploymentStatus(status) ? false : 5_000;
    },
  });
}
