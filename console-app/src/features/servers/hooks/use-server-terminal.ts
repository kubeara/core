import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/api/api-error";
import {
  DEPLOYMENT_SOCKET_EVENTS,
  type TerminalDisconnectPayload,
  type TerminalOutputPayload,
} from "@/constants/deployment-events";
import {
  emitTerminalInput,
  emitTerminalResize,
  getDeploymentSocket,
  subscribeTerminalSession,
  unsubscribeTerminalSession,
} from "@/lib/socket/deployment-socket-client";
import { connectTerminal, disconnectTerminal } from "../api";
import type { TerminalConnectionStatus, TerminalTransport } from "../types";

type UseServerTerminalOptions = {
  serverId: string;
  onOutput?: (data: string) => void;
  onSessionClosed?: () => void;
};

type UseServerTerminalResult = {
  status: TerminalConnectionStatus;
  sessionId: string | null;
  transport: TerminalTransport | null;
  errorMessage: string | null;
  isSocketConnected: boolean;
  refitToken: number;
  connect: (dimensions?: { cols: number; rows: number }) => Promise<void>;
  disconnect: () => Promise<void>;
  sendInput: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
  refit: () => void;
};

export function useServerTerminal(
  options: UseServerTerminalOptions,
): UseServerTerminalResult {
  const { serverId, onOutput, onSessionClosed } = options;

  const [status, setStatus] = useState<TerminalConnectionStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transport, setTransport] = useState<TerminalTransport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [refitToken, setRefitToken] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const transportRef = useRef<TerminalTransport | null>(null);
  const onOutputRef = useRef(onOutput);
  const onSessionClosedRef = useRef(onSessionClosed);

  sessionIdRef.current = sessionId;
  transportRef.current = transport;
  onOutputRef.current = onOutput;
  onSessionClosedRef.current = onSessionClosed;

  const handleSessionClosed = useCallback(() => {
    const currentSessionId = sessionIdRef.current;
    if (currentSessionId) {
      unsubscribeTerminalSession(currentSessionId);
    }
    setSessionId(null);
    setTransport(null);
    setStatus("disconnected");
    onSessionClosedRef.current?.();
  }, []);

  // Socket stays subscribed for the full session lifetime (not tied to tab visibility).
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const socket = getDeploymentSocket();
    subscribeTerminalSession(sessionId);

    const handleSocketConnect = () => {
      setIsSocketConnected(true);
      subscribeTerminalSession(sessionId);
    };

    const handleSocketDisconnect = () => {
      setIsSocketConnected(false);
    };

    const handleOutput = (payload: TerminalOutputPayload) => {
      if (payload.sessionId !== sessionIdRef.current) {
        return;
      }
      onOutputRef.current?.(payload.data);
    };

    const handleTerminalDisconnect = (payload: TerminalDisconnectPayload) => {
      if (payload.sessionId !== sessionIdRef.current) {
        return;
      }
      handleSessionClosed();
    };

    socket.on("connect", handleSocketConnect);
    socket.on("disconnect", handleSocketDisconnect);
    socket.on(DEPLOYMENT_SOCKET_EVENTS.TERMINAL_OUTPUT, handleOutput);
    socket.on(
      DEPLOYMENT_SOCKET_EVENTS.TERMINAL_DISCONNECT,
      handleTerminalDisconnect,
    );

    if (!socket.connected) {
      socket.connect();
    }

    setIsSocketConnected(socket.connected);

    return () => {
      socket.off("connect", handleSocketConnect);
      socket.off("disconnect", handleSocketDisconnect);
      socket.off(DEPLOYMENT_SOCKET_EVENTS.TERMINAL_OUTPUT, handleOutput);
      socket.off(
        DEPLOYMENT_SOCKET_EVENTS.TERMINAL_DISCONNECT,
        handleTerminalDisconnect,
      );
    };
  }, [sessionId, handleSessionClosed]);

  useEffect(() => {
    return () => {
      const currentSessionId = sessionIdRef.current;
      if (currentSessionId) {
        void disconnectTerminal(serverId, currentSessionId).catch(
          () => undefined,
        );
        unsubscribeTerminalSession(currentSessionId);
      }
    };
  }, [serverId]);

  const connect = useCallback(
    async (dimensions?: { cols: number; rows: number }) => {
      setStatus("connecting");
      setErrorMessage(null);

      try {
        const session = await connectTerminal(serverId, dimensions);
        setSessionId(session.sessionId);
        setTransport(session.transport);
        setStatus("connected");
        subscribeTerminalSession(session.sessionId);
      } catch (error) {
        setStatus("error");
        setErrorMessage(getErrorMessage(error));
      }
    },
    [serverId],
  );

  const disconnect = useCallback(async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) {
      setStatus("idle");
      setTransport(null);
      return;
    }

    try {
      await disconnectTerminal(serverId, currentSessionId);
    } catch {
      // Session may already be closed on the server.
    } finally {
      unsubscribeTerminalSession(currentSessionId);
      setSessionId(null);
      setTransport(null);
      setStatus("idle");
    }
  }, [serverId]);

  const sendInput = useCallback((data: string) => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) {
      return;
    }
    emitTerminalInput(currentSessionId, data);
  }, []);

  const sendResize = useCallback((nextCols: number, nextRows: number) => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) {
      return;
    }
    emitTerminalResize(currentSessionId, nextCols, nextRows);
  }, []);

  const refit = useCallback(() => {
    setRefitToken((value) => value + 1);
  }, []);

  return {
    status,
    sessionId,
    transport,
    errorMessage,
    isSocketConnected,
    refitToken,
    connect,
    disconnect,
    sendInput,
    sendResize,
    refit,
  };
}
