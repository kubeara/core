import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/api/api-error";
import {
  DEPLOYMENT_SOCKET_EVENTS,
  type ContainerLogsDataPayload,
  type ContainerLogsErrorPayload,
  type ContainerLogsStopPayload,
} from "@/constants/deployment-events";
import {
  getDeploymentSocket,
  subscribeContainerLogsSession,
  unsubscribeContainerLogsSession,
} from "@/lib/socket/deployment-socket-client";
import { startContainerLogs, stopContainerLogs } from "../api";
import { mapContainerLogsErrorMessage } from "../constants/container-logs-messages";
import type { StreamStatus } from "../types";

type UseContainerLogsOptions = {
  serverId: string;
  containerId: string;
  containerName?: string;
  enabled: boolean;
  onOutput?: (data: string) => void;
  onSessionClosed?: () => void;
};

type UseContainerLogsResult = {
  status: StreamStatus;
  sessionId: string | null;
  errorMessage: string | null;
  isSocketConnected: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function useContainerLogs(
  options: UseContainerLogsOptions,
): UseContainerLogsResult {
  const {
    serverId,
    containerId,
    containerName,
    enabled,
    onOutput,
    onSessionClosed,
  } = options;

  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const onOutputRef = useRef(onOutput);
  const onSessionClosedRef = useRef(onSessionClosed);

  sessionIdRef.current = sessionId;
  onOutputRef.current = onOutput;
  onSessionClosedRef.current = onSessionClosed;

  const handleSessionClosed = useCallback(() => {
    const currentSessionId = sessionIdRef.current;
    if (currentSessionId) {
      unsubscribeContainerLogsSession(currentSessionId);
    }
    setSessionId(null);
    setStatus("complete");
    onSessionClosedRef.current?.();
  }, []);

  const stop = useCallback(async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) {
      setStatus("complete");
      return;
    }

    try {
      await stopContainerLogs(serverId, currentSessionId);
    } catch {
      // Session may already be closed on the server.
    } finally {
      unsubscribeContainerLogsSession(currentSessionId);
      setSessionId(null);
      setStatus("complete");
    }
  }, [serverId]);

  const start = useCallback(async () => {
    setStatus("connecting");
    setErrorMessage(null);

    try {
      const session = await startContainerLogs(serverId, containerId, {
        containerName,
      });
      setSessionId(session.sessionId);
      subscribeContainerLogsSession(session.sessionId);
      setStatus("streaming");
    } catch (error) {
      setStatus("error");
      setErrorMessage(mapContainerLogsErrorMessage(getErrorMessage(error)));
    }
  }, [containerId, containerName, serverId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function connectLogs() {
      setStatus("connecting");
      setErrorMessage(null);

      try {
        const session = await startContainerLogs(serverId, containerId, {
          containerName,
        });
        if (cancelled) {
          await stopContainerLogs(serverId, session.sessionId).catch(() => undefined);
          return;
        }

        setSessionId(session.sessionId);
        subscribeContainerLogsSession(session.sessionId);
        setStatus("streaming");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setStatus("error");
        setErrorMessage(mapContainerLogsErrorMessage(getErrorMessage(error)));
      }
    }

    void connectLogs();

    return () => {
      cancelled = true;
      const currentSessionId = sessionIdRef.current;
      if (currentSessionId) {
        void stopContainerLogs(serverId, currentSessionId).catch(() => undefined);
        unsubscribeContainerLogsSession(currentSessionId);
      }
    };
  }, [containerId, containerName, enabled, serverId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const socket = getDeploymentSocket();

    const handleSocketConnect = () => {
      setIsSocketConnected(true);
      subscribeContainerLogsSession(sessionId);
    };

    const handleSocketDisconnect = () => {
      setIsSocketConnected(false);
    };

    const handleData = (payload: ContainerLogsDataPayload) => {
      if (payload.sessionId !== sessionIdRef.current) {
        return;
      }
      onOutputRef.current?.(payload.data);
      setStatus("streaming");
    };

    const handleError = (payload: ContainerLogsErrorPayload) => {
      if (payload.sessionId !== sessionIdRef.current) {
        return;
      }
      setStatus("error");
      setErrorMessage(mapContainerLogsErrorMessage(payload.error));
    };

    const handleStop = (payload: ContainerLogsStopPayload) => {
      if (payload.sessionId !== sessionIdRef.current) {
        return;
      }
      handleSessionClosed();
    };

    socket.on("connect", handleSocketConnect);
    socket.on("disconnect", handleSocketDisconnect);
    socket.on(DEPLOYMENT_SOCKET_EVENTS.CONTAINER_LOGS_DATA, handleData);
    socket.on(DEPLOYMENT_SOCKET_EVENTS.CONTAINER_LOGS_ERROR, handleError);
    socket.on(DEPLOYMENT_SOCKET_EVENTS.CONTAINER_LOGS_STOP, handleStop);

    if (!socket.connected) {
      socket.connect();
    }

    setIsSocketConnected(socket.connected);

    return () => {
      socket.off("connect", handleSocketConnect);
      socket.off("disconnect", handleSocketDisconnect);
      socket.off(DEPLOYMENT_SOCKET_EVENTS.CONTAINER_LOGS_DATA, handleData);
      socket.off(DEPLOYMENT_SOCKET_EVENTS.CONTAINER_LOGS_ERROR, handleError);
      socket.off(DEPLOYMENT_SOCKET_EVENTS.CONTAINER_LOGS_STOP, handleStop);
    };
  }, [handleSessionClosed, sessionId]);

  return {
    status,
    sessionId,
    errorMessage,
    isSocketConnected,
    start,
    stop,
  };
}
