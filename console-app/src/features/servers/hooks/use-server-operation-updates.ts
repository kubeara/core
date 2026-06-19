import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEPLOYMENT_SOCKET_EVENTS } from "@/constants/deployment-events";
import { QUERY_KEYS } from "@/constants/query-keys";
import { getDeploymentSocket } from "@/lib/socket/deployment-socket-client";
import type { ServerOperationUpdatedPayload } from "../types/server-operation-events";

/**
 * Subscribes to server add/delete background operation updates over the
 * deployments socket and refreshes server queries when the backend pushes
 * a change (no polling).
 */
export function useServerOperationUpdates(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getDeploymentSocket();

    function invalidateServerQueries(serverId?: string) {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.servers.lists(),
      });

      if (serverId) {
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.servers.detail(serverId),
        });
      }
    }

    function handleServerOperationUpdated(
      payload: ServerOperationUpdatedPayload,
    ) {
      if (!payload?.serverId) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.servers.lists(),
      });

      if (payload.deleted) {
        queryClient.removeQueries({
          queryKey: QUERY_KEYS.servers.detail(payload.serverId),
        });
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.servers.detail(payload.serverId),
      });
    }

    function handleAgentConnectionChange(payload: { serverId?: string }) {
      invalidateServerQueries(payload.serverId);
    }

    function handleReconnect() {
      invalidateServerQueries();
    }

    socket.on(
      DEPLOYMENT_SOCKET_EVENTS.SERVER_OPERATION_UPDATED,
      handleServerOperationUpdated,
    );
    socket.on(
      DEPLOYMENT_SOCKET_EVENTS.AGENT_CONNECTED,
      handleAgentConnectionChange,
    );
    socket.on(
      DEPLOYMENT_SOCKET_EVENTS.AGENT_DISCONNECTED,
      handleAgentConnectionChange,
    );
    socket.on("connect", handleReconnect);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off(
        DEPLOYMENT_SOCKET_EVENTS.SERVER_OPERATION_UPDATED,
        handleServerOperationUpdated,
      );
      socket.off(
        DEPLOYMENT_SOCKET_EVENTS.AGENT_CONNECTED,
        handleAgentConnectionChange,
      );
      socket.off(
        DEPLOYMENT_SOCKET_EVENTS.AGENT_DISCONNECTED,
        handleAgentConnectionChange,
      );
      socket.off("connect", handleReconnect);
    };
  }, [queryClient]);
}
