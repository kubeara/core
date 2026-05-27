import type { Server, ServerStatus } from "@/types";

/**
 * Backend servers API response format
 */
export type ServersApiResponse<T = unknown> = {
    message?: string;
    servers?: T[];
    server?: T;
};

/**
 * Request payload for creating/updating a server
 */
export type ServerRequest = {
    name: string;
    username: string;
    host: string;
    status: ServerStatus;
};

/**
 * Server list response
 */
export type ServersListResponse = Server[];

/**
 * Single server response
 */
export type ServerResponse = Server;
