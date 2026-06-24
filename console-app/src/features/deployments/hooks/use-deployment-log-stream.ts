import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEPLOYMENT_SOCKET_EVENTS,
  isTerminalDeploymentStatus,
  type DeploymentLogStreamPayload,
  type DeploymentStatus,
  type SocketDeploymentStatus,
} from "@/constants/deployment-events";
import {
  getDeploymentSocket,
  subscribeDeploymentLogs,
  unsubscribeDeploymentLogs,
} from "@/lib/socket/deployment-socket-client";
import type { DeploymentLogLine, StreamStatus } from "../types";

const MAX_LINES = 5000;

type UseDeploymentLogStreamOptions = {
  deploymentId?: string;
  serverId?: string;
  enabled?: boolean;
};

type UseDeploymentLogStreamResult = {
  logs: DeploymentLogLine[];
  lineCount: number;
  status: StreamStatus;
  deploymentStatus: DeploymentStatus | null;
  deploymentStatusMessage: string | null;
  deploymentError: string | null;
  hasReceivedStatus: boolean;
  isSocketConnected: boolean;
};

let lineCounter = 0;
function nextLineId(): string {
  lineCounter += 1;
  return `line-${lineCounter}`;
}

function streamPayloadToLogLine(
  payload: DeploymentLogStreamPayload,
): DeploymentLogLine {
  const phasePrefix =
    payload.phase === "install"
      ? "[INSTALL]"
      : payload.phase === "container"
        ? "[CONTAINER]"
        : "[DEPLOY]";
  const body = payload.message.trimStart();
  const displayMessage = body.startsWith("[") ? body : `${phasePrefix} ${body}`;

  return {
    id: nextLineId(),
    message: displayMessage,
    timestamp: payload.timestamp,
    phase: payload.phase,
    stream: payload.stream,
    containerId: payload.containerId,
    containerName: payload.containerName,
  };
}

export function useDeploymentLogStream(
  options: UseDeploymentLogStreamOptions,
): UseDeploymentLogStreamResult {
  const { deploymentId, enabled = true } = options;

  const [logs, setLogs] = useState<DeploymentLogLine[]>([]);
  const [deploymentStatus, setDeploymentStatus] =
    useState<DeploymentStatus | null>(null);
  const [deploymentStatusMessage, setDeploymentStatusMessage] = useState<
    string | null
  >(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [hasReceivedStatus, setHasReceivedStatus] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [hasReceivedLog, setHasReceivedLog] = useState(false);
  const [streamError, setStreamError] = useState(false);

  const deploymentIdRef = useRef(deploymentId);
  const trackedDeploymentIdRef = useRef<string | undefined>(undefined);

  deploymentIdRef.current = deploymentId;

  const appendLine = useCallback((line: DeploymentLogLine) => {
    setLogs((prev) => {
      const next = [...prev, line];
      if (next.length <= MAX_LINES) return next;
      return next.slice(next.length - MAX_LINES);
    });
  }, []);

  useEffect(() => {
    if (!enabled || !deploymentId) {
      return;
    }

    const socket = getDeploymentSocket();

    function handleConnect() {
      setIsSocketConnected(true);
      setStreamError(false);
    }

    function handleDisconnect() {
      setIsSocketConnected(false);
    }

    function handleConnectError() {
      setStreamError(true);
    }

    function handleDeploymentStream(payload: DeploymentLogStreamPayload) {
      if (payload.deploymentId !== deploymentIdRef.current) {
        return;
      }

      setHasReceivedLog(true);
      appendLine(streamPayloadToLogLine(payload));
    }

    function handleStatus(payload: SocketDeploymentStatus) {
      if (payload.deploymentId !== deploymentIdRef.current) {
        return;
      }

      setHasReceivedStatus(true);
      setDeploymentStatus(payload.status);
      setDeploymentStatusMessage(payload.message?.trim() || null);
      setDeploymentError(payload.error?.trim() || null);
    }

    setIsSocketConnected(socket.connected);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on(
      DEPLOYMENT_SOCKET_EVENTS.DEPLOYMENT_STREAM,
      handleDeploymentStream,
    );
    socket.on(DEPLOYMENT_SOCKET_EVENTS.DEPLOYMENT_STATUS, handleStatus);

    if (!socket.connected) {
      socket.connect();
    }

    subscribeDeploymentLogs(deploymentId);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off(
        DEPLOYMENT_SOCKET_EVENTS.DEPLOYMENT_STREAM,
        handleDeploymentStream,
      );
      socket.off(DEPLOYMENT_SOCKET_EVENTS.DEPLOYMENT_STATUS, handleStatus);
    };
  }, [appendLine, deploymentId, enabled]);

  useEffect(() => {
    if (!deploymentId) {
      return;
    }

    return () => {
      unsubscribeDeploymentLogs(deploymentId);
    };
  }, [deploymentId]);

  useEffect(() => {
    const previous = trackedDeploymentIdRef.current;
    trackedDeploymentIdRef.current = deploymentId;

    if (!deploymentId) return;

    if (previous && previous !== deploymentId) {
      unsubscribeDeploymentLogs(previous);
      setLogs([]);
      setHasReceivedLog(false);
      setHasReceivedStatus(false);
      setDeploymentStatus(null);
      setDeploymentStatusMessage(null);
      setDeploymentError(null);
      setStreamError(false);
    }
  }, [deploymentId]);

  let status: StreamStatus;
  if (streamError && !isSocketConnected) {
    status = "error";
  } else if (deploymentStatus === "running") {
    status = "streaming";
  } else if (isTerminalDeploymentStatus(deploymentStatus)) {
    status = deploymentStatus === "success" ? "complete" : "error";
  } else if (hasReceivedLog || logs.length > 0) {
    status = "streaming";
  } else if (!isSocketConnected) {
    status = "connecting";
  } else {
    status = deploymentId ? "streaming" : "connecting";
  }

  return {
    logs,
    lineCount: logs.length,
    status,
    deploymentStatus,
    deploymentStatusMessage,
    deploymentError,
    hasReceivedStatus,
    isSocketConnected,
  };
}
