/**
 * Singleton Socket.io client for the /deployments namespace.
 */
import { io, Socket } from "socket.io-client";
import { DEPLOYMENT_SOCKET_EVENTS } from "@/constants/deployment-events";
import { buildDeploymentsSocketUrl } from "@/api/axios";

let socket: Socket | null = null;
const subscribedDeploymentIds = new Set<string>();
const subscribedTerminalSessionIds = new Set<string>();
const subscribedContainerLogsSessionIds = new Set<string>();

function emitLogsSubscribe(deploymentId: string): void {
  if (!socket?.connected) {
    return;
  }

  socket.emit(DEPLOYMENT_SOCKET_EVENTS.LOGS_SUBSCRIBE, { deploymentId });
}

function emitTerminalSubscribe(sessionId: string): void {
  if (!socket?.connected) {
    return;
  }

  socket.emit(DEPLOYMENT_SOCKET_EVENTS.TERMINAL_SUBSCRIBE, { sessionId });
}

function emitContainerLogsSubscribe(sessionId: string): void {
  if (!socket?.connected) {
    return;
  }

  socket.emit(DEPLOYMENT_SOCKET_EVENTS.CONTAINER_LOGS_SUBSCRIBE, { sessionId });
}

function handleReconnectSubscribe(): void {
  for (const deploymentId of subscribedDeploymentIds) {
    emitLogsSubscribe(deploymentId);
  }
  for (const sessionId of subscribedTerminalSessionIds) {
    emitTerminalSubscribe(sessionId);
  }
  for (const sessionId of subscribedContainerLogsSessionIds) {
    emitContainerLogsSubscribe(sessionId);
  }
}

export function getDeploymentSocket(): Socket {
  if (socket) return socket;

  socket = io(buildDeploymentsSocketUrl(), {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    withCredentials: false,
    transports: ["websocket", "polling"],
  });

  socket.on("connect", handleReconnectSubscribe);

  return socket;
}

export function subscribeDeploymentLogs(deploymentId: string): void {
  const trimmed = deploymentId.trim();
  if (!trimmed) return;

  subscribedDeploymentIds.add(trimmed);
  const activeSocket = getDeploymentSocket();

  if (activeSocket.connected) {
    emitLogsSubscribe(trimmed);
    return;
  }

  activeSocket.connect();
  activeSocket.once("connect", () => emitLogsSubscribe(trimmed));
}

export function unsubscribeDeploymentLogs(deploymentId?: string): void {
  if (deploymentId) {
    subscribedDeploymentIds.delete(deploymentId.trim());
    return;
  }

  subscribedDeploymentIds.clear();
}

export function subscribeTerminalSession(sessionId: string): void {
  const trimmed = sessionId.trim();
  if (!trimmed) return;

  subscribedTerminalSessionIds.add(trimmed);
  const activeSocket = getDeploymentSocket();

  if (activeSocket.connected) {
    emitTerminalSubscribe(trimmed);
    return;
  }

  activeSocket.connect();
  activeSocket.once("connect", () => emitTerminalSubscribe(trimmed));
}

export function unsubscribeTerminalSession(sessionId?: string): void {
  if (sessionId) {
    subscribedTerminalSessionIds.delete(sessionId.trim());
    return;
  }

  subscribedTerminalSessionIds.clear();
}

export function emitTerminalInput(sessionId: string, data: string): void {
  const activeSocket = getDeploymentSocket();
  if (!activeSocket.connected) {
    return;
  }

  activeSocket.emit(DEPLOYMENT_SOCKET_EVENTS.TERMINAL_INPUT, {
    sessionId,
    data,
  });
}

export function emitTerminalResize(
  sessionId: string,
  cols: number,
  rows: number,
): void {
  const activeSocket = getDeploymentSocket();
  if (!activeSocket.connected) {
    return;
  }

  activeSocket.emit(DEPLOYMENT_SOCKET_EVENTS.TERMINAL_RESIZE, {
    sessionId,
    cols,
    rows,
  });
}

export function emitTerminalDisconnect(sessionId: string): void {
  const activeSocket = getDeploymentSocket();
  if (!activeSocket.connected) {
    return;
  }

  activeSocket.emit(DEPLOYMENT_SOCKET_EVENTS.TERMINAL_DISCONNECT, {
    sessionId,
  });
}

export function subscribeContainerLogsSession(sessionId: string): void {
  const trimmed = sessionId.trim();
  if (!trimmed) return;

  subscribedContainerLogsSessionIds.add(trimmed);
  const activeSocket = getDeploymentSocket();

  if (activeSocket.connected) {
    emitContainerLogsSubscribe(trimmed);
    return;
  }

  activeSocket.connect();
  activeSocket.once("connect", () => emitContainerLogsSubscribe(trimmed));
}

export function unsubscribeContainerLogsSession(sessionId?: string): void {
  if (sessionId) {
    subscribedContainerLogsSessionIds.delete(sessionId.trim());
    return;
  }

  subscribedContainerLogsSessionIds.clear();
}

export function emitContainerLogsStop(sessionId: string): void {
  const activeSocket = getDeploymentSocket();
  if (!activeSocket.connected) {
    return;
  }

  activeSocket.emit(DEPLOYMENT_SOCKET_EVENTS.CONTAINER_LOGS_STOP, {
    sessionId,
  });
}
