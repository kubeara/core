/**
 * Singleton Socket.io client for the /deployments namespace.
 */
import { io, Socket } from "socket.io-client";
import { DEPLOYMENT_SOCKET_EVENTS } from "@/constants/deployment-events";
import { buildDeploymentsSocketUrl } from "@/api/axios";

let socket: Socket | null = null;
const subscribedDeploymentIds = new Set<string>();

function emitLogsSubscribe(deploymentId: string): void {
  if (!socket?.connected) {
    return;
  }

  socket.emit(DEPLOYMENT_SOCKET_EVENTS.LOGS_SUBSCRIBE, { deploymentId });
}

function handleReconnectSubscribe(): void {
  for (const deploymentId of subscribedDeploymentIds) {
    emitLogsSubscribe(deploymentId);
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
