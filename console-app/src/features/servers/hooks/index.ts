import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getErrorMessage, toApiError } from "@/api/api-error";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { QUERY_KEYS } from "@/constants/query-keys";
import {
  connectServer,
  deleteServer,
  disconnectServer,
  fetchServer,
  fetchServerResources,
  fetchServers,
  onboardServer,
  updateServer,
  type DeleteServerInput,
} from "../api";
import type {
  OnboardServerRequest,
  ServerApiResponse,
  ServersListParams,
  UpdateServerRequest,
} from "../types";
import { mapServerApiToServer } from "../types";
import type { Server } from "@/types";

export { useServerOperationUpdates } from "./use-server-operation-updates";

function withServerMutationError<TData, TVariables>(
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

export function useServersQuery(params: ServersListParams) {
  return useQuery({
    queryKey: QUERY_KEYS.servers.list(params),
    queryFn: () => fetchServers(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useServerQuery(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.servers.detail(id ?? ""),
    queryFn: () => fetchServer(id!),
    enabled: !!id,
    select: (data): Server => mapServerApiToServer(data),
  });
}

export function useServerApiQuery(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.servers.detail(id ?? ""),
    queryFn: () => fetchServer(id!),
    enabled: !!id,
  });
}

type UseServerResourcesQueryOptions = {
  /** When false, skips fetch but still returns cached data if available. */
  enabled?: boolean;
};

/**
 * Hook to fetch on-demand server resource metrics.
 */
export function useServerResourcesQuery(
  serverId: string,
  options?: UseServerResourcesQueryOptions,
) {
  const enabled = options?.enabled ?? Boolean(serverId);

  return useQuery({
    queryKey: QUERY_KEYS.servers.resources(serverId),
    queryFn: () => fetchServerResources(serverId),
    enabled: Boolean(serverId) && enabled,
    staleTime: 60_000,
  });
}

export function useCreateServerMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { server: ServerApiResponse; message: string },
    ApiError,
    OnboardServerRequest
  >({
    mutationFn: withServerMutationError(onboardServer),
    onSuccess: ({ server, message }) => {
      showSuccessToast(message);
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.servers.lists(),
      });
      queryClient.setQueryData<ServerApiResponse>(
        QUERY_KEYS.servers.detail(server.id),
        server,
      );
    },
  });
}

export function useUpdateServerMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { server: ServerApiResponse; message: string },
    ApiError,
    { id: string; input: UpdateServerRequest }
  >({
    mutationFn: withServerMutationError(
      ({ id, input }: { id: string; input: UpdateServerRequest }) =>
        updateServer(id, input),
    ),
    onSuccess: ({ server, message }) => {
      showSuccessToast(message);
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.servers.lists(),
      });
      queryClient.setQueryData(QUERY_KEYS.servers.detail(server.id), server);
    },
  });
}

export function useConnectServerMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ connected: boolean; message: string }, ApiError, string>(
    {
      mutationFn: withServerMutationError(connectServer),
      onSuccess: (data, id) => {
        showSuccessToast(data.message);
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.servers.lists(),
        });
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.servers.detail(id),
        });
      },
      onError: (error) => {
        showErrorToast(getErrorMessage(error));
      },
    },
  );
}

export function useDisconnectServerMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ connected: boolean; message: string }, ApiError, string>(
    {
      mutationFn: withServerMutationError(disconnectServer),
      onSuccess: (data, id) => {
        showSuccessToast(data.message);
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.servers.lists(),
        });
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.servers.detail(id),
        });
      },
      onError: (error) => {
        showErrorToast(getErrorMessage(error));
      },
    },
  );
}

export function useDeleteServerMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { deleted: boolean; pending?: boolean; message: string },
    ApiError,
    DeleteServerInput
  >({
    mutationFn: withServerMutationError(deleteServer),
    onSuccess: (data, input) => {
      showSuccessToast(data.message);
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.servers.lists(),
      });
      if (!data.pending) {
        queryClient.removeQueries({
          queryKey: QUERY_KEYS.servers.detail(input.id),
        });
      }
    },
    onError: (error) => {
      showErrorToast(getErrorMessage(error));
    },
  });
}
