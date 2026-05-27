import { apiClient } from "@/api/axios";
import type { Server } from "@/types";
import type { ServerRequest, ServersApiResponse } from "../types";

/**
 * Fetch all servers for the current user.
 * 
 * @returns Array of servers
 * @throws {ApiError} If request fails
 * 
 * @example
 * const servers = await fetchServers();
 * console.log(`Found ${servers.length} servers`);
 */
export async function fetchServers(): Promise<Server[]> {
    const response = await apiClient.get<ServersApiResponse<Server>>("/servers");
    return response.data.servers ?? [];
}

/**
 * Fetch a single server by ID.
 * 
 * @param id - Server ID
 * @returns Server object
 * @throws {ApiError} If server not found or request fails
 * 
 * @example
 * const server = await fetchServer('server-123');
 * console.log(server.name);
 */
export async function fetchServer(id: string): Promise<Server> {
    const response = await apiClient.get<ServersApiResponse<Server>>(
        `/servers/${id}`,
    );
    const server = response.data.server;
    if (!server) {
        throw new Error("No server data in response");
    }
    return server;
}

/**
 * Create a new server.
 * 
 * @param input - Server data (name, username, host, status)
 * @returns Created server object
 * @throws {ApiError} If creation fails
 * 
 * @example
 * const server = await createServer({
 *   name: 'Production Server',
 *   username: 'admin',
 *   host: '192.168.1.100',
 *   status: 'online'
 * });
 */
export async function createServer(input: ServerRequest): Promise<Server> {
    const response = await apiClient.post<ServersApiResponse<Server>>(
        "/servers",
        input,
    );
    const server = response.data.server;
    if (!server) {
        throw new Error("No server data in response");
    }
    return server;
}

/**
 * Update an existing server.
 * 
 * @param id - Server ID
 * @param input - Partial server data to update
 * @returns Updated server object
 * @throws {ApiError} If update fails
 * 
 * @example
 * const server = await updateServer('server-123', {
 *   name: 'Updated Server Name',
 *   status: 'offline'
 * });
 */
export async function updateServer(
    id: string,
    input: Partial<ServerRequest>,
): Promise<Server> {
    const response = await apiClient.put<ServersApiResponse<Server>>(
        `/servers/${id}`,
        input,
    );
    const server = response.data.server;
    if (!server) {
        throw new Error("No server data in response");
    }
    return server;
}

/**
 * Delete a server.
 * 
 * @param id - Server ID
 * @throws {ApiError} If deletion fails
 * 
 * @example
 * await deleteServer('server-123');
 * console.log('Server deleted');
 */
export async function deleteServer(id: string): Promise<void> {
    await apiClient.delete(`/servers/${id}`);
}
