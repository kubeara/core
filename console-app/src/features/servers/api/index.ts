import { apiClient } from "@/api/axios";
import type {
  OnboardServerRequest,
  OnboardSuccessData,
  PaginatedServersResponse,
  ServerApiResponse,
  ServerResources,
  ServersApiResponse,
  ServersListParams,
  TerminalConnectRequest,
  TerminalSession,
  UpdateServerRequest,
} from "../types";
import {
  assertApiSuccess,
  extractApiMessage,
  runServerApiCall,
  unwrapServerApiData,
} from "../utils/server-api-error";
import { DELETE_SERVER_OPERATION_TIMEOUT_MS } from "../constants/api-timeouts";
import { SERVER_API_FALLBACK_MESSAGES } from "../constants/messages";

function responseBody(
  response: { data: ServersApiResponse<unknown> },
): Record<string, unknown> {
  return response.data as Record<string, unknown>;
}

export async function fetchServers(
  params: ServersListParams = {},
): Promise<PaginatedServersResponse> {
  return runServerApiCall(async () => {
    const response = await apiClient.get<
      ServersApiResponse<PaginatedServersResponse>
    >("/servers", { params });
    return unwrapServerApiData<PaginatedServersResponse>(
      responseBody(response),
      SERVER_API_FALLBACK_MESSAGES.LOAD_LIST,
    );
  });
}

export async function fetchServer(id: string): Promise<ServerApiResponse> {
  return runServerApiCall(async () => {
    const response = await apiClient.get<ServersApiResponse<ServerApiResponse>>(
      `/servers/${id}`,
    );
    return unwrapServerApiData<ServerApiResponse>(
      responseBody(response),
      SERVER_API_FALLBACK_MESSAGES.LOAD_ONE,
    );
  });
}

export async function fetchServerResources(
  serverId: string,
): Promise<ServerResources> {
  return runServerApiCall(async () => {
    const response = await apiClient.get<ServersApiResponse<ServerResources>>(
      `/servers/${encodeURIComponent(serverId)}/resources`,
    );
    return unwrapServerApiData<ServerResources>(
      responseBody(response),
      SERVER_API_FALLBACK_MESSAGES.LOAD_RESOURCES,
    );
  });
}

export async function onboardServer(
  input: OnboardServerRequest,
): Promise<{ server: ServerApiResponse; message: string }> {
  return runServerApiCall(async () => {
    const response = await apiClient.post<
      ServersApiResponse<OnboardSuccessData>
    >("/servers/onboard", input);
    const body = responseBody(response);
    const result = unwrapServerApiData<OnboardSuccessData>(
      body,
      SERVER_API_FALLBACK_MESSAGES.ONBOARD,
    );
    const server = await fetchServer(result.serverId);
    return {
      server,
      message: extractApiMessage(body, SERVER_API_FALLBACK_MESSAGES.ONBOARD_SUCCESS),
    };
  });
}

export async function updateServer(
  id: string,
  input: UpdateServerRequest,
): Promise<{ server: ServerApiResponse; message: string }> {
  return runServerApiCall(async () => {
    const response = await apiClient.patch<ServersApiResponse<ServerApiResponse>>(
      `/servers/${id}`,
      input,
    );
    const body = responseBody(response);
    const server = unwrapServerApiData<ServerApiResponse>(
      body,
      SERVER_API_FALLBACK_MESSAGES.UPDATE,
    );
    return {
      server,
      message: extractApiMessage(
        body,
        SERVER_API_FALLBACK_MESSAGES.UPDATE_SUCCESS,
      ),
    };
  });
}

export async function connectServer(
  id: string,
): Promise<{ connected: boolean; message: string }> {
  return runServerApiCall(async () => {
    const response = await apiClient.post<
      ServersApiResponse<{ connected: boolean }>
    >(`/servers/${id}/connect`);
    const body = responseBody(response);
    assertApiSuccess(body, SERVER_API_FALLBACK_MESSAGES.CONNECT);
    const data = unwrapServerApiData<{ connected: boolean }>(
      body,
      SERVER_API_FALLBACK_MESSAGES.CONNECT,
    );
    return {
      connected: data.connected,
      message: extractApiMessage(
        body,
        SERVER_API_FALLBACK_MESSAGES.CONNECT_SUCCESS,
      ),
    };
  });
}

export async function disconnectServer(
  id: string,
): Promise<{ connected: boolean; message: string }> {
  return runServerApiCall(async () => {
    const response = await apiClient.post<
      ServersApiResponse<{ connected: boolean }>
    >(`/servers/${id}/disconnect`);
    const body = responseBody(response);
    assertApiSuccess(body, SERVER_API_FALLBACK_MESSAGES.DISCONNECT);
    const data = unwrapServerApiData<{ connected: boolean }>(
      body,
      SERVER_API_FALLBACK_MESSAGES.DISCONNECT,
    );
    return {
      connected: data.connected,
      message: extractApiMessage(
        body,
        SERVER_API_FALLBACK_MESSAGES.DISCONNECT_SUCCESS,
      ),
    };
  });
}

/**
 * Connects to a terminal session.
 */
export async function connectTerminal(
  serverId: string,
  input: TerminalConnectRequest = {},
): Promise<TerminalSession> {
  return runServerApiCall(async () => {
    const response = await apiClient.post<ServersApiResponse<TerminalSession>>(
      `/servers/${encodeURIComponent(serverId)}/terminal/connect`,
      input,
    );
    return unwrapServerApiData<TerminalSession>(
      responseBody(response),
      SERVER_API_FALLBACK_MESSAGES.TERMINAL_CONNECT,
    );
  });
}

/**
 * Disconnects from a terminal session.
 */
export async function disconnectTerminal(
  serverId: string,
  sessionId: string,
): Promise<{ disconnected: true; message: string }> {
  return runServerApiCall(async () => {
    const response = await apiClient.post<
      ServersApiResponse<{ disconnected: true }>
    >(`/servers/${encodeURIComponent(serverId)}/terminal/disconnect`, {
      sessionId,
    });
    const body = responseBody(response);
    unwrapServerApiData<{ disconnected: true }>(
      body,
      SERVER_API_FALLBACK_MESSAGES.TERMINAL_DISCONNECT,
    );
    return {
      disconnected: true as const,
      message: extractApiMessage(
        body,
        SERVER_API_FALLBACK_MESSAGES.TERMINAL_DISCONNECT_SUCCESS,
      ),
    };
  });
}

export type DeleteServerInput = {
  id: string;
  removeManagedServices?: boolean;
};

export async function deleteServer(
  input: DeleteServerInput,
): Promise<{ deleted: true; message: string }> {
  return runServerApiCall(async () => {
    const response = await apiClient.post<
      ServersApiResponse<{ deleted: true }>
    >(
      `/servers/${input.id}/delete`,
      {
        removeManagedServices: input.removeManagedServices === true,
      },
      { timeout: DELETE_SERVER_OPERATION_TIMEOUT_MS },
    );
    const body = responseBody(response);
    unwrapServerApiData<{ deleted: true }>(
      body,
      SERVER_API_FALLBACK_MESSAGES.DELETE,
    );
    return {
      deleted: true as const,
      message: extractApiMessage(
        body,
        SERVER_API_FALLBACK_MESSAGES.DELETE_SUCCESS,
      ),
    };
  });
}
