import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/query-keys";
import {
  fetchDeployment,
  fetchServerContainers,
  fetchServerDeployments,
} from "../api";

/**
 * Hook to fetch server containers.
 */
export function useServerContainersQuery(serverId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.deployments.containers(serverId),
    queryFn: () => fetchServerContainers(serverId),
    enabled: Boolean(serverId),
    staleTime: 60_000,
    refetchInterval: 60_000,
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

export { useDeploymentLogStream } from "./use-deployment-log-stream";
