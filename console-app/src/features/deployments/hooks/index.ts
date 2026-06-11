import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getErrorMessage, toApiError } from "@/api/api-error";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { QUERY_KEYS } from "@/constants/query-keys";
import {
  executeContainerAction,
  fetchDeployment,
  fetchServerContainers,
  fetchServerDeployments,
} from "../api";
import {
  getContainerActionErrorMessage,
  getContainerActionSuccessMessage,
} from "../constants/container-action-messages";
import type { ContainerActionResult, ContainerActionType } from "../types";

type UseServerContainersQueryOptions = {
  /** When false, skips fetch/poll but still returns cached data if available. */
  enabled?: boolean;
  /** Poll every 60s while enabled. Defaults to false. */
  poll?: boolean;
};

/**
 * Hook to fetch server containers.
 */
export function useServerContainersQuery(
  serverId: string,
  options?: UseServerContainersQueryOptions,
) {
  const enabled = options?.enabled ?? Boolean(serverId);
  const poll = options?.poll ?? false;

  return useQuery({
    queryKey: QUERY_KEYS.deployments.containers(serverId),
    queryFn: () => fetchServerContainers(serverId),
    enabled: Boolean(serverId) && enabled,
    staleTime: 60_000,
    refetchInterval: poll ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
}

/**
 * Hook to fetch server deployments.
 */
export function useServerDeploymentsQuery(serverId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.deployments.byServer(serverId),
    queryFn: () => fetchServerDeployments(serverId),
    enabled: Boolean(serverId),
    staleTime: 60_000,
  });
}

/**
 * Hook to fetch deployment details.
 */
export function useDeploymentQuery(deploymentId: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.deployments.detail(deploymentId ?? ""),
    queryFn: () => fetchDeployment(deploymentId!),
    enabled: Boolean(deploymentId),
    staleTime: 10_000,
    refetchInterval: (query) => {
      const status = query.state.data?.deploymentStatus;
      if (
        status === "success" ||
        status === "failed" ||
        status === "cancelled" ||
        status === "removed"
      ) {
        return false;
      }
      return 5_000;
    },
  });
}

/**
 * The input for the container action mutation.
 */
type ContainerActionInput = {
  serverId: string;
  containerId: string;
  containerName: string;
  action: ContainerActionType;
};

export function useContainerActionMutation() {
  const queryClient = useQueryClient();

  return useMutation<ContainerActionResult, ApiError, ContainerActionInput>({
    mutationFn: async ({ serverId, containerId, action }) => {
      try {
        return await executeContainerAction(serverId, containerId, action);
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (data, { serverId, containerName, action }) => {
      showSuccessToast(
        getContainerActionSuccessMessage(
          action,
          containerName,
          data.executedVia,
        ),
      );
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.deployments.containers(serverId),
      });
    },
    onError: (error, { action, containerName }) => {
      showErrorToast(
        getContainerActionErrorMessage(
          action,
          containerName,
          getErrorMessage(error),
        ),
      );
    },
  });
}

export { useDeploymentLogStream } from "./use-deployment-log-stream";
