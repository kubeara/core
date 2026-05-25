import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createServer,
  deleteServer,
  fetchServer,
  fetchServers,
  updateServer,
  type ServerInput,
} from "@/api/servers-api";
import { queryKeys } from "@/api/query-keys";

export function useServersQuery() {
  return useQuery({
    queryKey: queryKeys.servers.all,
    queryFn: fetchServers,
  });
}

export function useServerQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.servers.detail(id ?? ""),
    queryFn: () => fetchServer(id!),
    enabled: !!id,
  });
}

export function useCreateServerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ServerInput) => createServer(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.all });
    },
  });
}

export function useUpdateServerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<ServerInput>;
    }) => updateServer(id, input),
    onSuccess: (server) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.all });
      queryClient.setQueryData(queryKeys.servers.detail(server.id), server);
    },
  });
}

export function useDeleteServerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteServer(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.all });
      queryClient.removeQueries({ queryKey: queryKeys.servers.detail(id) });
    },
  });
}
