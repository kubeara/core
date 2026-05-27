import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/query-keys";
import {
    createServer,
    deleteServer,
    fetchServer,
    fetchServers,
    updateServer,
} from "../api";
import type { ServerRequest } from "../types";

/**
 * Query hook to fetch all servers.
 * 
 * @returns TanStack Query result with servers array
 * 
 * @example
 * function ServersList() {
 *   const { data: servers, isPending } = useServersQuery();
 *   
 *   if (isPending) return <div>Loading...</div>;
 *   return <ul>{servers.map(s => <li key={s.id}>{s.name}</li>)}</ul>;
 * }
 */
export function useServersQuery() {
    return useQuery({
        queryKey: QUERY_KEYS.servers.all,
        queryFn: fetchServers,
    });
}

/**
 * Query hook to fetch a single server by ID.
 * 
 * @param id - Server ID (query is disabled if undefined)
 * @returns TanStack Query result with server object
 * 
 * @example
 * function ServerDetail({ id }: { id: string }) {
 *   const { data: server, isPending } = useServerQuery(id);
 *   
 *   if (isPending) return <div>Loading...</div>;
 *   if (!server) return <div>Server not found</div>;
 *   return <div>{server.name}</div>;
 * }
 */
export function useServerQuery(id: string | undefined) {
    return useQuery({
        queryKey: QUERY_KEYS.servers.detail(id ?? ""),
        queryFn: () => fetchServer(id!),
        enabled: !!id,
    });
}

/**
 * Mutation hook for creating a new server.
 * 
 * On success:
 * - Invalidates servers list query to refetch
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function CreateServerForm() {
 *   const createMutation = useCreateServerMutation();
 *   
 *   const handleSubmit = async (data) => {
 *     try {
 *       await createMutation.mutateAsync(data);
 *       alert('Server created!');
 *     } catch (error) {
 *       console.error('Creation failed:', error.message);
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useCreateServerMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: ServerRequest) => createServer(input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.servers.all });
        },
    });
}

/**
 * Mutation hook for updating an existing server.
 * 
 * On success:
 * - Invalidates servers list query to refetch
 * - Updates the specific server detail cache
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function EditServerForm({ serverId }: { serverId: string }) {
 *   const updateMutation = useUpdateServerMutation();
 *   
 *   const handleSubmit = async (data) => {
 *     try {
 *       await updateMutation.mutateAsync({ id: serverId, input: data });
 *       alert('Server updated!');
 *     } catch (error) {
 *       console.error('Update failed:', error.message);
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 */
export function useUpdateServerMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            input,
        }: {
            id: string;
            input: Partial<ServerRequest>;
        }) => updateServer(id, input),
        onSuccess: (server) => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.servers.all });
            queryClient.setQueryData(QUERY_KEYS.servers.detail(server.id), server);
        },
    });
}

/**
 * Mutation hook for deleting a server.
 * 
 * On success:
 * - Invalidates servers list query to refetch
 * - Removes the specific server detail from cache
 * 
 * @returns TanStack Query mutation result
 * 
 * @example
 * function DeleteServerButton({ serverId }: { serverId: string }) {
 *   const deleteMutation = useDeleteServerMutation();
 *   
 *   const handleDelete = async () => {
 *     if (!confirm('Delete this server?')) return;
 *     
 *     try {
 *       await deleteMutation.mutateAsync(serverId);
 *       alert('Server deleted!');
 *     } catch (error) {
 *       console.error('Deletion failed:', error.message);
 *     }
 *   };
 *   
 *   return <button onClick={handleDelete}>Delete</button>;
 * }
 */
export function useDeleteServerMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteServer(id),
        onSuccess: (_data, id) => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.servers.all });
            queryClient.removeQueries({ queryKey: QUERY_KEYS.servers.detail(id) });
        },
    });
}
