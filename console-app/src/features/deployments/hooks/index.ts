import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/query-keys";
import { fetchDeployment, fetchServerDeployments } from "../api";

export function useServerDeploymentsQuery(serverId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.deployments.byServer(serverId),
    queryFn: () => fetchServerDeployments(serverId),
    enabled: Boolean(serverId),
    staleTime: 30_000,
  });
}

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
