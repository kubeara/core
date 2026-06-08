import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";
import {
  DeploymentStatusPayload,
  DeploymentLogPayload,
  DeploymentEvents,
  DeploymentLogStreamPayload,
  DeploymentLogStreamType,
  LogsSubscribePayload,
  SocketDeployMessage,
  SocketRemoveMessage,
  ContainerDiscoverRequestPayload,
  ContainerDiscoverResponsePayload,
  DiscoveredContainerPayload,
  ServerGetResourcesRequestPayload,
  ServerGetResourcesResponsePayload,
  ServerResourcesMetricsPayload,
} from "@shared/socket-events";
import { randomUUID } from "node:crypto";
import { DeploymentsService } from "@control-panel/modules/deployments/deployments.service";
import { AgentServerBindingService } from "@control-panel/modules/server-connections/services/agent-server-binding.service";
import { DeploymentStreamBufferService } from "./deployment-stream-buffer.service";
import type {
  PendingContainerDiscovery,
  PendingServerResources,
} from "./interfaces";
import {
  SERVER_ID_HEADER,
  CONTAINER_DISCOVER_TIMEOUT_MS,
  SERVER_GET_RESOURCES_TIMEOUT_MS,
  STREAM_DEBUG,
} from "./constants";

function deploymentRoom(deploymentId: string): string {
  return `deployment:${deploymentId}`;
}

@Injectable()
@WebSocketGateway({
  namespace: "deployments",
  cors: { origin: "*" },
})
export class DeploymentGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DeploymentGateway.name);

  constructor(
    @Inject(forwardRef(() => DeploymentsService))
    private readonly deploymentsService: DeploymentsService,
    private readonly agentServerBinding: AgentServerBindingService,
    private readonly streamBuffer: DeploymentStreamBufferService,
  ) {}

  @WebSocketServer()
  server!: Server;

  /** Agent socket registry: socketId → socket (multiple agents). */
  private connectedAgents = new Map<string, Socket>();
  private agentPublicIps = new Map<string, string>();
  /** serverId → agent socket (one active agent per server). */
  private agentsByServerId = new Map<string, Socket>();
  private serverIdBySocketId = new Map<string, string>();
  private readonly pendingContainerDiscovery = new Map<
    string,
    PendingContainerDiscovery
  >();
  private readonly pendingServerResources = new Map<
    string,
    PendingServerResources
  >();

  afterInit(): void {
    this.logStreamDiagnostics("afterInit");
    this.logger.log("[stream] WebSocket Gateway initialized");
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const socketId = client.id;
      const publicIp = this.extractPublicIpFromHandshake(client);
      const explicitServerId = this.extractServerIdFromHandshake(client);

      const serverId = await this.agentServerBinding.resolveServerIdForAgent({
        explicitServerId,
        reportedPublicIp: publicIp || null,
      });

      const isAgent = this.isLikelyAgentClient(client);

      if (isAgent) {
        this.connectedAgents.set(socketId, client);
        if (publicIp) {
          this.agentPublicIps.set(socketId, publicIp);
        }

        if (serverId) {
          const previous = this.agentsByServerId.get(serverId);
          if (previous && previous.id !== socketId) {
            this.logger.warn(
              `Replacing prior agent socket for serverId=${serverId} (old=${previous.id}, new=${socketId})`,
            );
            this.unregisterServerBinding(previous.id);
            previous.disconnect(true);
          }

          this.agentsByServerId.set(serverId, client);
          this.serverIdBySocketId.set(socketId, serverId);
        }

        this.attachAgentInboundHandlers(client);

        this.logger.log(
          `Agent connected: ${socketId} (agents=${this.connectedAgents.size})` +
            (serverId ? ` serverId=${serverId}` : " (unbound)") +
            (publicIp ? ` publicIp=${publicIp}` : ""),
        );

        client.on(
          DeploymentEvents.DEPLOYMENT_LOG,
          (payload: DeploymentLogPayload) => {
            this.processAgentLog(client, payload);
          },
        );
        client.on(
          DeploymentEvents.DEPLOYMENT_STATUS,
          (payload: DeploymentStatusPayload) => {
            void this.processDeploymentStatus(client, payload);
          },
        );
      } else {
        this.logger.log(
          `Console client connected: ${socketId} (agents=${this.connectedAgents.size})`,
        );
      }

      const ns = this.getNamespaceServer();
      if (isAgent) {
        ns?.emit(DeploymentEvents.AGENT_CONNECTED, {
          agentId: socketId,
          serverId: serverId ?? undefined,
          timestamp: new Date().toISOString(),
          totalAgents: this.connectedAgents.size,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle connection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  handleDisconnect(client: Socket): void {
    try {
      const socketId = client.id;
      const wasAgent = this.connectedAgents.has(socketId);
      const serverId = this.serverIdBySocketId.get(socketId);

      this.connectedAgents.delete(socketId);
      this.agentPublicIps.delete(socketId);
      this.unregisterServerBinding(socketId);

      this.logger.log(
        `${wasAgent ? "Agent" : "Client"} disconnected: ${socketId} (agents=${this.connectedAgents.size})`,
      );

      if (wasAgent) {
        if (serverId) {
          this.rejectPendingDiscoveryForServer(
            serverId,
            "Agent disconnected during container discovery",
          );
          this.rejectPendingResourcesForServer(
            serverId,
            "Agent disconnected during server resource collection",
          );
        }

        const ns = this.getNamespaceServer();
        ns?.emit(DeploymentEvents.AGENT_DISCONNECTED, {
          agentId: socketId,
          timestamp: new Date().toISOString(),
          totalAgents: this.connectedAgents.size,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle disconnect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @SubscribeMessage(DeploymentEvents.DEPLOYMENT_LOG)
  handleDeploymentLog(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DeploymentLogPayload,
  ): void {
    this.processAgentLog(client, payload);
  }

  @SubscribeMessage(DeploymentEvents.DEPLOYMENT_STATUS)
  handleDeploymentStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DeploymentStatusPayload,
  ): Promise<void> {
    return this.processDeploymentStatus(client, payload);
  }

  @SubscribeMessage(DeploymentEvents.SERVER_GET_RESOURCES_RESULT)
  handleServerGetResourcesResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ServerGetResourcesResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        this.logger.warn(
          `Ignoring server get-resources result without requestId from ${client.id}`,
        );
        return;
      }

      const pending = this.pendingServerResources.get(requestId);
      if (!pending) {
        this.logger.warn(
          `No pending server get-resources for requestId=${requestId}`,
        );
        return;
      }

      const serverId = this.serverIdBySocketId.get(client.id);
      if (serverId && serverId !== pending.serverId) {
        this.logger.warn(
          `Server get-resources result server mismatch requestId=${requestId} expected=${pending.serverId} got=${serverId}`,
        );
        return;
      }

      clearTimeout(pending.timer);
      this.pendingServerResources.delete(requestId);

      if (payload.error) {
        pending.reject(new Error(payload.error));
        return;
      }

      if (!payload.resources) {
        pending.reject(new Error("Agent returned no server resource metrics"));
        return;
      }

      pending.resolve(payload.resources);
    } catch (error) {
      this.logger.error(
        `Failed to process server get-resources result: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @SubscribeMessage(DeploymentEvents.CONTAINER_DISCOVER_RESULT)
  handleContainerDiscoverResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ContainerDiscoverResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        this.logger.warn(
          `Ignoring container discover result without requestId from ${client.id}`,
        );
        return;
      }

      const pending = this.pendingContainerDiscovery.get(requestId);
      if (!pending) {
        this.logger.warn(
          `No pending container discovery for requestId=${requestId}`,
        );
        return;
      }

      const serverId = this.serverIdBySocketId.get(client.id);
      if (serverId && serverId !== pending.serverId) {
        this.logger.warn(
          `Container discover result server mismatch requestId=${requestId} expected=${pending.serverId} got=${serverId}`,
        );
        return;
      }

      clearTimeout(pending.timer);
      this.pendingContainerDiscovery.delete(requestId);

      if (payload.error) {
        pending.reject(new Error(payload.error));
        return;
      }

      pending.resolve(payload.containers ?? []);
    } catch (error) {
      this.logger.error(
        `Failed to process container discover result: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @SubscribeMessage(DeploymentEvents.LOGS_SUBSCRIBE)
  async handleLogsSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: LogsSubscribePayload,
  ): Promise<void> {
    const deploymentId = body?.deploymentId?.trim();
    if (!deploymentId) {
      this.logger.warn(
        `[stream] logs:subscribe rejected for ${client.id}: missing deploymentId`,
      );
      return;
    }

    const room = deploymentRoom(deploymentId);

    try {
      await client.join(room);
    } catch (error) {
      this.logger.error(
        `[stream] logs:subscribe join failed client=${client.id} room=${room}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    this.logger.log(
      `[stream] client joined room client=${client.id} deploymentId=${deploymentId} room=${room}`,
    );

    this.logStreamDiagnostics("logs:subscribe", {
      socketId: client.id,
      deploymentId,
      room,
    });

    this.replayBufferedLogsToClient(client, deploymentId);
  }

  private isLikelyAgentClient(client: Socket): boolean {
    const headerIp = client.handshake.headers["x-agent-public-ip"];
    const queryIp = client.handshake.query.publicIp;
    const hasPublicIp = Boolean(
      (Array.isArray(headerIp) ? headerIp[0] : headerIp) ??
      (Array.isArray(queryIp) ? queryIp[0] : queryIp),
    );
    const hasServerHeader = Boolean(
      client.handshake.headers[SERVER_ID_HEADER] ??
      client.handshake.query.serverId,
    );
    return hasPublicIp || hasServerHeader;
  }

  private processAgentLog(client: Socket, payload: DeploymentLogPayload): void {
    try {
      if (!payload?.message) {
        return;
      }

      if (!payload.deploymentId) {
        this.logger.warn(
          `[stream] agent log missing deploymentId from agent=${client.id}`,
        );
        return;
      }

      this.logger.log(
        `[stream] agent log deploymentId=${payload.deploymentId} source=${payload.source ?? "deployment"} bytes=${payload.message.length}`,
      );

      const serverId = this.serverIdBySocketId.get(client.id);
      const isContainer = payload.source === "container";
      const containerName =
        isContainer && payload.message.startsWith("[")
          ? payload.message.match(/^\[([^\]]+)\]/)?.[1]
          : undefined;

      this.emitStreamPayload({
        deploymentId: payload.deploymentId,
        serverId,
        containerId: isContainer ? payload.containerId : undefined,
        containerName: containerName ?? payload.containerId,
        phase: isContainer ? "container" : "deploy",
        source: isContainer ? "container" : "deployment",
        stream: payload.type,
        timestamp: payload.timestamp ?? new Date().toISOString(),
        message: payload.message,
      });
    } catch (error) {
      this.logger.error(
        `[stream] failed to process agent log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async processDeploymentStatus(
    client: Socket,
    payload: DeploymentStatusPayload,
  ): Promise<void> {
    try {
      if (!payload?.deploymentId) {
        this.logger.warn(
          `Ignoring deployment status without deploymentId from ${client.id}`,
        );
        return;
      }

      const serverId = this.serverIdBySocketId.get(client.id);
      const room = deploymentRoom(payload.deploymentId);

      this.logStreamDiagnostics("status:inbound", {
        socketId: client.id,
        deploymentId: payload.deploymentId,
        serverId,
        status: payload.status,
        room,
      });

      try {
        if (payload.status === "removed") {
          await this.deploymentsService.softDeleteDeploymentRecord(
            payload.deploymentId,
            { message: payload.message },
          );
        } else {
          await this.deploymentsService.updateStatus(
            payload.deploymentId,
            payload.status,
            {
              message: payload.message,
              error: payload.error,
            },
          );
        }
      } catch (error) {
        this.logger.warn(
          `Could not persist deployment status for ${payload.deploymentId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const enriched = {
        agentId: client.id,
        serverId,
        ...payload,
        receivedAt: new Date().toISOString(),
      };

      const ns = this.getNamespaceServer();
      if (!ns) {
        return;
      }

      this.logStreamDiagnostics("status:emit", {
        deploymentId: payload.deploymentId,
        serverId,
        status: payload.status,
        room,
        event: DeploymentEvents.DEPLOYMENT_STATUS,
      });

      ns.emit(DeploymentEvents.DEPLOYMENT_STATUS, enriched);
      ns.to(room).emit(DeploymentEvents.DEPLOYMENT_STATUS, enriched);
    } catch (error) {
      this.logger.error(
        `Failed to process deployment status event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  broadcastDeploymentLog(
    payload: DeploymentLogPayload & {
      serverId: string;
      deploymentId: string;
      phase?: DeploymentLogStreamPayload["phase"];
    },
  ): void {
    const message = payload.message?.trim();
    if (!message) {
      return;
    }

    const phase = payload.phase ?? "install";

    this.logger.log(
      `[stream] broadcast ${phase} log deploymentId=${payload.deploymentId} serverId=${payload.serverId} bytes=${message.length}`,
    );

    this.emitStreamPayload({
      deploymentId: payload.deploymentId,
      serverId: payload.serverId,
      phase,
      source: phase === "install" ? "install" : "deployment",
      stream: payload.type,
      timestamp: payload.timestamp ?? new Date().toISOString(),
      message,
    });
  }

  private emitStreamPayload(
    input: Omit<DeploymentLogStreamPayload, "stream"> & {
      stream?: DeploymentLogStreamType;
    },
  ): void {
    const deploymentId = input.deploymentId?.trim();
    if (!deploymentId) {
      this.logger.warn("[stream] emit skipped: missing deploymentId");
      return;
    }

    const ns = this.getNamespaceServer();
    if (!ns) {
      this.logger.error(
        "[stream] emit skipped: namespace server is not initialized",
      );
      return;
    }

    try {
      const normalized: DeploymentLogStreamPayload = {
        deploymentId,
        serverId: input.serverId,
        containerId: input.containerId,
        containerName: input.containerName,
        phase: input.phase,
        source: input.source,
        stream: input.stream ?? "stdout",
        timestamp: input.timestamp ?? new Date().toISOString(),
        message: input.message,
      };

      const room = deploymentRoom(deploymentId);

      this.logStreamDiagnostics("emit", {
        deploymentId,
        serverId: normalized.serverId,
        phase: normalized.phase,
        room,
        event: DeploymentEvents.DEPLOYMENT_STREAM,
        bytes: normalized.message.length,
      });

      this.streamBuffer.append(normalized);

      // Namespace broadcast: required for local deployOnLocal (console + agent on
      // localhost). Room join + replay below covers late logs:subscribe.
      ns.emit(DeploymentEvents.DEPLOYMENT_STREAM, normalized);
    } catch (error) {
      this.logger.error(
        `[stream] failed to emit log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private replayBufferedLogsToClient(
    client: Socket,
    deploymentId: string,
  ): void {
    const buffered = this.streamBuffer.get(deploymentId);
    if (buffered.length === 0) {
      return;
    }

    this.logger.log(
      `[stream] replay ${buffered.length} buffered line(s) to client=${client.id} deploymentId=${deploymentId}`,
    );

    for (const entry of buffered) {
      client.emit(DeploymentEvents.DEPLOYMENT_STREAM, entry);
    }
  }

  private getNamespaceServer(): Server | null {
    return this.server ?? null;
  }

  private logStreamDiagnostics(
    context: string,
    extra?: Record<string, unknown>,
  ) {
    if (!STREAM_DEBUG) {
      return;
    }

    const ns = this.server;

    this.logger.debug(
      `[stream][diag] ${context} serverDefined=${Boolean(ns)} trackedAgents=${this.connectedAgents.size} ${extra ? JSON.stringify(extra) : ""}`,
    );
  }

  emitRemove(message: SocketRemoveMessage, serverId: string): void {
    try {
      const client = this.agentsByServerId.get(serverId);
      if (!client) {
        throw new Error(
          `No connected agent for server '${serverId}' (deployment ${message.payload.deploymentId})`,
        );
      }

      this.logger.log(
        `Emitting remove to serverId=${serverId} for deployment: ${message.payload.deploymentId}`,
      );
      client.emit(DeploymentEvents.REMOVE, message);
    } catch (error) {
      this.logger.error(
        `Failed to emit remove message: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  emitDeploy(message: SocketDeployMessage, serverId: string): void {
    try {
      const client = this.agentsByServerId.get(serverId);
      if (!client) {
        throw new Error(
          `No connected agent for server '${serverId}' (template ${message.payload.name})`,
        );
      }

      if (!client.connected) {
        throw new Error(
          `Agent for server '${serverId}' is disconnected (template ${message.payload.name})`,
        );
      }

      this.logger.log(
        `[DEPLOY_TRACE] emitting deploy deploymentId=${message.payload.deploymentId ?? "n/a"} serverId=${serverId} template=${message.payload.name} agentSocket=${client.id}`,
      );
      client.emit(DeploymentEvents.DEPLOY, message);
    } catch (error) {
      this.logger.error(
        `Failed to emit deploy message: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Requests on-demand server resource metrics from the connected agent.
   */
  requestServerResources(
    serverId: string,
    timeoutMs: number = SERVER_GET_RESOURCES_TIMEOUT_MS,
  ): Promise<ServerResourcesMetricsPayload> {
    return new Promise((resolve, reject) => {
      try {
        const client = this.agentsByServerId.get(serverId);
        if (!client?.connected) {
          reject(new Error(`No connected agent for server '${serverId}'`));
          return;
        }

        const requestId = randomUUID();
        const payload: ServerGetResourcesRequestPayload = { requestId };

        const timer = setTimeout(() => {
          this.pendingServerResources.delete(requestId);
          reject(
            new Error(
              `Server resource collection timed out after ${timeoutMs / 1000}s for server '${serverId}'`,
            ),
          );
        }, timeoutMs);

        this.pendingServerResources.set(requestId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        this.logger.log(
          `Requesting server resources requestId=${requestId} serverId=${serverId}`,
        );

        client.emit(DeploymentEvents.SERVER_GET_RESOURCES, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  requestContainerDiscovery(
    serverId: string,
  ): Promise<DiscoveredContainerPayload[]> {
    return new Promise((resolve, reject) => {
      try {
        const client = this.agentsByServerId.get(serverId);
        if (!client?.connected) {
          reject(new Error(`No connected agent for server '${serverId}'`));
          return;
        }

        const requestId = randomUUID();
        const payload: ContainerDiscoverRequestPayload = { requestId };

        const timer = setTimeout(() => {
          this.pendingContainerDiscovery.delete(requestId);
          reject(
            new Error(
              `Container discovery timed out after ${CONTAINER_DISCOVER_TIMEOUT_MS / 1000}s for server '${serverId}'`,
            ),
          );
        }, CONTAINER_DISCOVER_TIMEOUT_MS);

        this.pendingContainerDiscovery.set(requestId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        this.logger.log(
          `Requesting container discovery requestId=${requestId} serverId=${serverId}`,
        );

        client.emit(DeploymentEvents.CONTAINER_DISCOVER, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private attachAgentInboundHandlers(client: Socket): void {
    client.removeAllListeners(DeploymentEvents.CONTAINER_DISCOVER_RESULT);
    client.removeAllListeners(DeploymentEvents.SERVER_GET_RESOURCES_RESULT);
    client.on(
      DeploymentEvents.CONTAINER_DISCOVER_RESULT,
      (payload: ContainerDiscoverResponsePayload) => {
        this.handleContainerDiscoverResult(client, payload);
      },
    );
    client.on(
      DeploymentEvents.SERVER_GET_RESOURCES_RESULT,
      (payload: ServerGetResourcesResponsePayload) => {
        this.handleServerGetResourcesResult(client, payload);
      },
    );
  }

  private rejectPendingDiscoveryForServer(
    serverId: string,
    reason: string,
  ): void {
    for (const [requestId, pending] of this.pendingContainerDiscovery) {
      if (pending.serverId !== serverId) {
        continue;
      }
      clearTimeout(pending.timer);
      this.pendingContainerDiscovery.delete(requestId);
      pending.reject(new Error(reason));
    }
  }

  private rejectPendingResourcesForServer(
    serverId: string,
    reason: string,
  ): void {
    for (const [requestId, pending] of this.pendingServerResources) {
      if (pending.serverId !== serverId) {
        continue;
      }
      clearTimeout(pending.timer);
      this.pendingServerResources.delete(requestId);
      pending.reject(new Error(reason));
    }
  }

  isAgentConnectedForServer(serverId: string): boolean {
    try {
      return this.agentsByServerId.has(serverId);
    } catch (error) {
      this.logger.error(
        `Failed to check agent for server '${serverId}': ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  getConnectedAgents(): string[] {
    try {
      return Array.from(this.connectedAgents.keys());
    } catch (error) {
      this.logger.error(
        `Failed to get connected agents: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  getConnectedAgentsCount(): number {
    return this.connectedAgents.size;
  }

  getPrimaryAgentPublicIp(): string | null {
    try {
      const firstEntry = this.agentPublicIps.values().next();
      const publicIp = firstEntry.value?.trim();

      return publicIp || null;
    } catch (error) {
      this.logger.error(
        `Failed to get primary agent public IP: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private extractPublicIpFromHandshake(client: Socket): string {
    try {
      const headerIp = client.handshake.headers["x-agent-public-ip"];
      const queryIp = client.handshake.query.publicIp;
      return String(
        (Array.isArray(headerIp) ? headerIp[0] : headerIp) ??
          (Array.isArray(queryIp) ? queryIp[0] : queryIp) ??
          "",
      ).trim();
    } catch {
      return "";
    }
  }

  private extractServerIdFromHandshake(client: Socket): string | null {
    try {
      const headerValue = client.handshake.headers[SERVER_ID_HEADER];
      const queryValue = client.handshake.query.serverId;
      const raw = String(
        (Array.isArray(headerValue) ? headerValue[0] : headerValue) ??
          (Array.isArray(queryValue) ? queryValue[0] : queryValue) ??
          "",
      ).trim();

      return raw || null;
    } catch (error) {
      this.logger.warn(
        `Failed to parse server id from handshake: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private unregisterServerBinding(socketId: string): void {
    try {
      const serverId = this.serverIdBySocketId.get(socketId);
      if (serverId) {
        const bound = this.agentsByServerId.get(serverId);
        if (bound?.id === socketId) {
          this.agentsByServerId.delete(serverId);
        }
        this.serverIdBySocketId.delete(socketId);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to unregister server binding for socket ${socketId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
