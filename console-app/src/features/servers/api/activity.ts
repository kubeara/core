import { apiClient } from "@/api/axios";
import { unwrapServerApiData } from "../utils/server-api-error";
import type { ActivityDetail, ActivityListItem } from "../types/activity";

function responseBody(response: { data: unknown }): Record<string, unknown> {
  return response.data as Record<string, unknown>;
}

/**
 * Fetches activity history for a server.
 */
export async function fetchServerActivities(
  serverId: string,
): Promise<ActivityListItem[]> {
  const response = await apiClient.get("/activity", {
    params: { serverId },
  });
  return unwrapServerApiData<ActivityListItem[]>(
    responseBody(response),
    "Failed to load activity",
  );
}

/**
 * Fetches one activity row (error message / status — no separate logs).
 */
export async function fetchActivityDetail(
  activityId: string,
): Promise<ActivityDetail> {
  const response = await apiClient.get(
    `/activity/${encodeURIComponent(activityId)}`,
  );
  return unwrapServerApiData<ActivityDetail>(
    responseBody(response),
    "Failed to load activity details",
  );
}
