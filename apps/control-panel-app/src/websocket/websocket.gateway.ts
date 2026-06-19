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
  AgentHelloPayload,
  ContainerActionRequestPayload,
  ContainerActionResponsePayload,
  ContainerActionType,
  ContainerDiscoverRequestPayload,
  ContainerDiscoverResponsePayload,
  DiscoveredContainerPayload,
  ServerGetResourcesRequestPayload,
  ServerGetResourcesResponsePayload,
  AgentRemoveRequestPayload,
  AgentRemoveResponsePayload,
  ServerResourcesMetricsPayload,
  TerminalConnectRequestPayload,
  TerminalConnectResponsePayload,
  TerminalDisconnectPayload,
  TerminalInputPayload,
  TerminalOutputPayload,
  TerminalResizePayload,
  TerminalSubscribePayload,
  ContainerLogsStartRequestPayload,
  ContainerLogsStartResponsePayload,
  ContainerLogsStopPayload,
  ContainerLogsDataPayload,
  ContainerLogsErrorPayload,
  ContainerLogsSubscribePayload,
} from "@shared/socket-events";
import { randomUUID } from "node:crypto";
import { DeploymentsService } from "@control-panel/modules/deployments/deployments.service";
import { AgentServerBindingService } from "@control-panel/modules/server-connections/services/agent-server-binding.service";
import { SshTerminalService } from "@control-panel/modules/terminal/ssh-terminal.service";
import { TerminalTransport } from "@control-panel/modules/terminal/enums/terminal-transport.enum";
import { DeploymentStreamBufferService } from "./deployment-stream-buffer.service";
import type {
  PendingContainerAction,
  PendingContainerDiscovery,
  PendingContainerLogsStart,
  PendingDeploymentRemove,
  PendingAgentRemove,
  PendingServerResources,
  PendingTerminalConnect,
  TerminalSessionRecord,
  ContainerLogsSessionRecord,
} from "./interfaces";
import {
  SERVER_ID_HEADER,
  CONTAINER_ACTION_TIMEOUT_MS,
  CONTAINER_DISCOVER_TIMEOUT_MS,
  CONTAINER_LOGS_START_TIMEOUT_MS,
  DEPLOYMENT_REMOVE_TIMEOUT_MS,
  AGENT_REMOVE_TIMEOUT_MS,
  SERVER_GET_RESOURCES_TIMEOUT_MS,
  TERMINAL_CONNECT_TIMEOUT_MS,
  STREAM_DEBUG,
} from "./constants";

function deploymentRoom(deploymentId: string): string {
  return `deployment:${deploymentId}`;
}

function terminalRoom(sessionId: string): string {
  return `terminal:${sessionId}`;
}

function containerLogsRoom(sessionId: string): string {
  return `container-logs:${sessionId}`;
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
    @Inject(forwardRef(() => SshTerminalService))
    private readonly sshTerminalService: SshTerminalService,
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
  private readonly pendingContainerActions = new Map<
    string,
    PendingContainerAction
  >();
  private readonly pendingDeploymentRemoves = new Map<
    string,
    PendingDeploymentRemove
  >();
  private readonly pendingAgentRemoves = new Map<string, PendingAgentRemove>();
  private readonly pendingTerminalConnects = new Map<
    string,
    PendingTerminalConnect
  >();
  private readonly terminalSessionsById = new Map<
    string,
    TerminalSessionRecord
  >();
  private readonly pendingContainerLogsStarts = new Map<
    string,
    PendingContainerLogsStart
  >();
  private readonly containerLogsSessionsById = new Map<
    string,
    ContainerLogsSessionRecord
  >();
  /** serverId → agent-advertised socket capabilities (from agent:hello). */
  private readonly agentCapabilitiesByServerId = new Map<string, Set<string>>();
  private readonly agentVersionsByServerId = new Map<string, string>();

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

          this.clearAgentMetadataForServer(serverId);
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
          this.clearAgentMetadataForServer(serverId);
          this.rejectPendingDiscoveryForServer(
            serverId,
            "Agent disconnected during container discovery",
          );
          this.rejectPendingResourcesForServer(
            serverId,
            "Agent disconnected during server resource collection",
          );
          this.rejectPendingContainerActionsForServer(
            serverId,
            "Agent disconnected during container action",
          );
          this.rejectPendingDeploymentRemovesForServer(
            serverId,
            "Agent disconnected during deployment removal",
          );
          this.rejectPendingAgentRemovesForServer(
            serverId,
            "Agent disconnected during agent removal",
          );
          this.rejectPendingTerminalConnectsForServer(
            serverId,
            "Agent disconnected during terminal connect",
          );
          this.rejectPendingContainerLogsStartsForServer(
            serverId,
            "Agent disconnected during container logs start",
          );
          this.closeTerminalSessionsForServer(serverId, "Agent disconnected");
          this.closeContainerLogsSessionsForServer(
            serverId,
            "Agent disconnected",
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

  @SubscribeMessage(DeploymentEvents.AGENT_HELLO)
  handleAgentHello(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AgentHelloPayload,
  ): void {
    this.processAgentHello(client, payload);
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

  @SubscribeMessage(DeploymentEvents.AGENT_REMOVE_RESULT)
  handleAgentRemoveResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AgentRemoveResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        this.logger.warn(
          `Ignoring agent remove result without requestId from ${client.id}`,
        );
        return;
      }

      const pending = this.pendingAgentRemoves.get(requestId);
      if (!pending) {
        this.logger.warn(`No pending agent remove for requestId=${requestId}`);
        return;
      }

      const serverId = this.serverIdBySocketId.get(client.id);
      if (serverId && serverId !== pending.serverId) {
        this.logger.warn(
          `Agent remove result server mismatch requestId=${requestId} expected=${pending.serverId} got=${serverId}`,
        );
        return;
      }

      clearTimeout(pending.timer);
      this.pendingAgentRemoves.delete(requestId);

      if (!payload.success) {
        pending.reject(
          new Error(payload.error?.trim() || "Agent removal failed"),
        );
        return;
      }

      pending.resolve({ imageRefs: payload.imageRefs ?? [] });
    } catch (error) {
      this.logger.error(
        `Failed to process agent remove result: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @SubscribeMessage(DeploymentEvents.CONTAINER_ACTION_RESULT)
  handleContainerActionResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ContainerActionResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        this.logger.warn(
          `Ignoring container action result without requestId from ${client.id}`,
        );
        return;
      }

      this.logger.log(
        `[CONTAINER_ACTION] result received from agentSocket=${client.id} requestId=${requestId} action=${payload?.action ?? "unknown"} success=${payload?.success ?? false}`,
      );

      const pending = this.pendingContainerActions.get(requestId);
      if (!pending) {
        this.logger.warn(
          `No pending container action for requestId=${requestId}`,
        );
        return;
      }

      const serverId = this.serverIdBySocketId.get(client.id);
      if (serverId && serverId !== pending.serverId) {
        this.logger.warn(
          `Container action result server mismatch requestId=${requestId} expected=${pending.serverId} got=${serverId}`,
        );
        return;
      }

      clearTimeout(pending.timer);
      this.pendingContainerActions.delete(requestId);
      pending.resolve(payload);
    } catch (error) {
      this.logger.error(
        `Failed to process container action result: ${error instanceof Error ? error.message : String(error)}`,
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

      this.logger.log(
        `[CONTAINER_DISCOVER] result received from agentSocket=${client.id} requestId=${requestId} count=${payload?.containers?.length ?? 0}${payload?.error ? ` error=${payload.error}` : ""}`,
      );

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

  @SubscribeMessage(DeploymentEvents.TERMINAL_SUBSCRIBE)
  async handleTerminalSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: TerminalSubscribePayload,
  ): Promise<void> {
    const sessionId = body?.sessionId?.trim();
    if (!sessionId || !this.terminalSessionsById.has(sessionId)) {
      this.logger.warn(
        `[TERMINAL] subscribe rejected for ${client.id}: unknown sessionId=${sessionId ?? "missing"}`,
      );
      return;
    }

    const room = terminalRoom(sessionId);
    try {
      await client.join(room);
      this.logger.log(
        `[TERMINAL] client joined room client=${client.id} sessionId=${sessionId}`,
      );
    } catch (error) {
      this.logger.error(
        `[TERMINAL] subscribe join failed client=${client.id} room=${room}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @SubscribeMessage(DeploymentEvents.CONTAINER_LOGS_SUBSCRIBE)
  async handleContainerLogsSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ContainerLogsSubscribePayload,
  ): Promise<void> {
    const sessionId = body?.sessionId?.trim();
    if (!sessionId || !this.containerLogsSessionsById.has(sessionId)) {
      this.logger.warn(
        `[CONTAINER_LOGS] subscribe rejected for ${client.id}: unknown sessionId=${sessionId ?? "missing"}`,
      );
      return;
    }

    const room = containerLogsRoom(sessionId);
    try {
      await client.join(room);
      this.logger.log(
        `[CONTAINER_LOGS] client joined room client=${client.id} sessionId=${sessionId}`,
      );
    } catch (error) {
      this.logger.error(
        `[CONTAINER_LOGS] subscribe join failed client=${client.id} room=${room}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @SubscribeMessage(DeploymentEvents.CONTAINER_LOGS_STOP)
  handleContainerLogsStopFromConsole(
    @MessageBody() payload: ContainerLogsStopPayload,
  ): void {
    const sessionId = payload?.sessionId?.trim();
    if (!sessionId) {
      return;
    }

    this.closeContainerLogsSession(sessionId, { notifyAgent: true });
  }

  @SubscribeMessage(DeploymentEvents.TERMINAL_INPUT)
  handleTerminalInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalInputPayload,
  ): void {
    this.forwardTerminalEventToAgent(
      client,
      DeploymentEvents.TERMINAL_INPUT,
      payload,
    );
  }

  @SubscribeMessage(DeploymentEvents.TERMINAL_RESIZE)
  handleTerminalResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalResizePayload,
  ): void {
    this.forwardTerminalEventToAgent(
      client,
      DeploymentEvents.TERMINAL_RESIZE,
      payload,
    );
  }

  @SubscribeMessage(DeploymentEvents.TERMINAL_DISCONNECT)
  handleTerminalDisconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalDisconnectPayload,
  ): void {
    const sessionId = payload?.sessionId?.trim();
    if (!sessionId) {
      return;
    }

    this.closeTerminalSession(sessionId, { notifyAgent: true });
  }

  @SubscribeMessage(DeploymentEvents.TERMINAL_CONNECT_RESULT)
  handleTerminalConnectResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalConnectResponsePayload,
  ): void {
    this.processTerminalConnectResult(client, payload);
  }

  @SubscribeMessage(DeploymentEvents.TERMINAL_OUTPUT)
  handleTerminalOutput(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalOutputPayload,
  ): void {
    this.relayTerminalOutput(client, payload);
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

      /**
       * Handles pending deployment removal status updates.
       */
      try {
        const pendingRemove = this.pendingDeploymentRemoves.get(
          payload.deploymentId,
        );
        if (pendingRemove) {
          if (payload.status === "removed") {
            clearTimeout(pendingRemove.timer);
            this.pendingDeploymentRemoves.delete(payload.deploymentId);
            pendingRemove.resolve();
          } else if (payload.status === "failed") {
            clearTimeout(pendingRemove.timer);
            this.pendingDeploymentRemoves.delete(payload.deploymentId);
            pendingRemove.reject(
              new Error(
                payload.error?.trim() ||
                  payload.message?.trim() ||
                  "Deployment removal failed",
              ),
            );
          }
        }

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

  /**
   * Requests deployment removal via the connected agent and waits for completion.
   */
  requestDeploymentRemove(
    serverId: string,
    deploymentId: string,
    templateSlug: string,
    timeoutMs: number = DEPLOYMENT_REMOVE_TIMEOUT_MS,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const client = this.agentsByServerId.get(serverId);
        if (!client?.connected) {
          reject(new Error(`No connected agent for server '${serverId}'`));
          return;
        }

        const timer = setTimeout(() => {
          this.pendingDeploymentRemoves.delete(deploymentId);
          reject(
            new Error(
              `Deployment remove timed out after ${timeoutMs / 1000}s for server '${serverId}'`,
            ),
          );
        }, timeoutMs);

        this.pendingDeploymentRemoves.set(deploymentId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        /**
         * Emits a deployment removal request to the connected agent.
         */
        const message: SocketRemoveMessage = {
          type: "REMOVE",
          payload: { deploymentId, templateSlug },
        };

        this.logger.log(
          `[DEPLOY_REMOVE] requesting removal deploymentId=${deploymentId} serverId=${serverId}`,
        );
        client.emit(DeploymentEvents.REMOVE, message);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Requests agent self-removal from the connected agent (must run last during server deletion).
   */
  requestAgentRemove(
    serverId: string,
    options?: { installDir?: string; agentImage?: string },
    timeoutMs: number = AGENT_REMOVE_TIMEOUT_MS,
  ): Promise<{ imageRefs: string[] }> {
    return new Promise((resolve, reject) => {
      try {
        const client = this.agentsByServerId.get(serverId);
        if (!client?.connected) {
          reject(new Error(`No connected agent for server '${serverId}'`));
          return;
        }

        if (!this.agentSupports(serverId, DeploymentEvents.AGENT_REMOVE)) {
          reject(
            new Error(
              `Connected agent for server '${serverId}' does not support agent removal`,
            ),
          );
          return;
        }

        const requestId = randomUUID();
        const payload: AgentRemoveRequestPayload = {
          requestId,
          installDir: options?.installDir?.trim() || undefined,
          agentImage: options?.agentImage?.trim() || undefined,
        };

        const timer = setTimeout(() => {
          this.pendingAgentRemoves.delete(requestId);
          reject(
            new Error(
              `Agent removal timed out after ${timeoutMs / 1000}s for server '${serverId}'`,
            ),
          );
        }, timeoutMs);

        this.pendingAgentRemoves.set(requestId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        this.logger.log(
          `[AGENT_REMOVE] requesting removal serverId=${serverId} requestId=${requestId}`,
        );
        client.emit(DeploymentEvents.AGENT_REMOVE, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
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
          `[SERVER_RESOURCES] emitting event=${DeploymentEvents.SERVER_GET_RESOURCES} to agentSocket=${client.id} serverId=${serverId} requestId=${requestId} connected=${client.connected}`,
        );

        client.emit(DeploymentEvents.SERVER_GET_RESOURCES, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Requests a container action.
   */
  requestContainerAction(
    serverId: string,
    containerId: string,
    action: ContainerActionType,
    timeoutMs: number = CONTAINER_ACTION_TIMEOUT_MS,
  ): Promise<ContainerActionResponsePayload> {
    return new Promise((resolve, reject) => {
      try {
        const client = this.agentsByServerId.get(serverId);
        if (!client?.connected) {
          reject(new Error(`No connected agent for server '${serverId}'`));
          return;
        }

        const requestId = randomUUID();
        const payload: ContainerActionRequestPayload = {
          requestId,
          containerId,
          action,
        };

        const timer = setTimeout(() => {
          this.pendingContainerActions.delete(requestId);
          reject(
            new Error(
              `Container action timed out after ${timeoutMs / 1000}s for server '${serverId}'`,
            ),
          );
        }, timeoutMs);

        this.pendingContainerActions.set(requestId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        this.logger.log(
          `[CONTAINER_ACTION] emitting event=${DeploymentEvents.CONTAINER_ACTION} to agentSocket=${client.id} serverId=${serverId} action=${action} containerId=${containerId} requestId=${requestId} connected=${client.connected}`,
        );

        client.emit(DeploymentEvents.CONTAINER_ACTION, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Requests a terminal connect.
   */
  requestTerminalConnect(
    serverId: string,
    userId: string,
    cols: number,
    rows: number,
    timeoutMs: number = TERMINAL_CONNECT_TIMEOUT_MS,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const client = this.agentsByServerId.get(serverId);
        if (!client?.connected) {
          reject(new Error(`No connected agent for server '${serverId}'`));
          return;
        }

        const requestId = randomUUID();
        const payload: TerminalConnectRequestPayload = {
          requestId,
          cols,
          rows,
        };

        const timer = setTimeout(() => {
          this.pendingTerminalConnects.delete(requestId);
          reject(
            new Error(
              `Terminal connect timed out after ${timeoutMs / 1000}s for server '${serverId}'`,
            ),
          );
        }, timeoutMs);

        this.pendingTerminalConnects.set(requestId, {
          serverId,
          userId,
          resolve,
          reject,
          timer,
        });

        this.logger.log(
          `[TERMINAL] emitting event=${DeploymentEvents.TERMINAL_CONNECT} to agentSocket=${client.id} serverId=${serverId} requestId=${requestId}`,
        );

        client.emit(DeploymentEvents.TERMINAL_CONNECT, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Registers a terminal session.
   */
  registerTerminalSession(
    sessionId: string,
    serverId: string,
    userId: string,
    transport: TerminalTransport = TerminalTransport.AGENT,
  ): void {
    this.terminalSessionsById.set(sessionId, {
      sessionId,
      serverId,
      userId,
      transport,
    });
  }

  broadcastTerminalOutput(sessionId: string, data: string): void {
    const session = this.terminalSessionsById.get(sessionId);
    if (!session) {
      return;
    }

    const ns = this.getNamespaceServer();
    if (!ns) {
      return;
    }

    ns.to(terminalRoom(sessionId)).emit(DeploymentEvents.TERMINAL_OUTPUT, {
      sessionId,
      data,
    });
  }

  getTerminalSession(sessionId: string): TerminalSessionRecord | undefined {
    return this.terminalSessionsById.get(sessionId);
  }

  /**
   * Requests a container log stream from the connected agent.
   */
  requestContainerLogsStart(
    serverId: string,
    userId: string,
    containerId: string,
    timeoutMs: number = CONTAINER_LOGS_START_TIMEOUT_MS,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const client = this.agentsByServerId.get(serverId);
        if (!client?.connected) {
          reject(new Error(`No connected agent for server '${serverId}'`));
          return;
        }

        const requestId = randomUUID();
        const sessionId = randomUUID();
        const payload: ContainerLogsStartRequestPayload = {
          requestId,
          sessionId,
          containerId,
        };

        const timer = setTimeout(() => {
          this.pendingContainerLogsStarts.delete(requestId);
          this.containerLogsSessionsById.delete(sessionId);
          reject(
            new Error(
              `Container logs start timed out after ${timeoutMs / 1000}s for server '${serverId}'`,
            ),
          );
        }, timeoutMs);

        this.pendingContainerLogsStarts.set(requestId, {
          serverId,
          userId,
          containerId,
          sessionId,
          resolve: (startedSessionId: string) => {
            resolve(startedSessionId);
          },
          reject: (error: Error) => {
            this.containerLogsSessionsById.delete(sessionId);
            reject(error);
          },
          timer,
        });

        this.registerContainerLogsSession(
          sessionId,
          serverId,
          userId,
          containerId,
        );

        this.logger.log(
          `[CONTAINER_LOGS] emitting event=${DeploymentEvents.CONTAINER_LOGS_START} to agentSocket=${client.id} serverId=${serverId} containerId=${containerId} sessionId=${sessionId} requestId=${requestId}`,
        );

        client.emit(DeploymentEvents.CONTAINER_LOGS_START, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  registerContainerLogsSession(
    sessionId: string,
    serverId: string,
    userId: string,
    containerId: string,
  ): void {
    this.containerLogsSessionsById.set(sessionId, {
      sessionId,
      serverId,
      userId,
      containerId,
    });
  }

  getContainerLogsSession(
    sessionId: string,
  ): ContainerLogsSessionRecord | undefined {
    return this.containerLogsSessionsById.get(sessionId);
  }

  /**
   * Closes a container logs session and notifies subscribers.
   */
  closeContainerLogsSession(
    sessionId: string,
    options: { notifyAgent?: boolean } = {},
  ): void {
    const session = this.containerLogsSessionsById.get(sessionId);
    if (!session) {
      return;
    }

    this.containerLogsSessionsById.delete(sessionId);

    if (options.notifyAgent !== false) {
      const agent = this.agentsByServerId.get(session.serverId);
      if (agent?.connected) {
        const payload: ContainerLogsStopPayload = { sessionId };
        agent.emit(DeploymentEvents.CONTAINER_LOGS_STOP, payload);
      }
    }

    const ns = this.getNamespaceServer();
    const payload: ContainerLogsStopPayload = { sessionId };
    ns?.to(containerLogsRoom(sessionId)).emit(
      DeploymentEvents.CONTAINER_LOGS_STOP,
      payload,
    );
  }

  /**
   * Closes a terminal session.
   */
  closeTerminalSession(
    sessionId: string,
    options: {
      notifyAgent?: boolean;
      skipTransportClose?: boolean;
    } = {},
  ): void {
    const session = this.terminalSessionsById.get(sessionId);
    if (!session) {
      return;
    }

    this.terminalSessionsById.delete(sessionId);

    if (!options.skipTransportClose) {
      if (session.transport === TerminalTransport.SSH) {
        this.sshTerminalService.closeSession(sessionId, {
          notifyClients: false,
        });
      } else if (options.notifyAgent !== false) {
        const agent = this.agentsByServerId.get(session.serverId);
        if (agent?.connected) {
          const payload: TerminalDisconnectPayload = { sessionId };
          agent.emit(DeploymentEvents.TERMINAL_DISCONNECT, payload);
        }
      }
    }

    const ns = this.getNamespaceServer();
    const payload: TerminalDisconnectPayload = { sessionId };
    ns?.to(terminalRoom(sessionId)).emit(
      DeploymentEvents.TERMINAL_DISCONNECT,
      payload,
    );
  }

  /**
   * Requests a container discovery.
   */
  requestContainerDiscovery(
    serverId: string,
    timeoutMs: number = CONTAINER_DISCOVER_TIMEOUT_MS,
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
              `Container discovery timed out after ${timeoutMs / 1000}s for server '${serverId}'`,
            ),
          );
        }, timeoutMs);

        this.pendingContainerDiscovery.set(requestId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        this.logger.log(
          `[CONTAINER_DISCOVER] emitting event=${DeploymentEvents.CONTAINER_DISCOVER} to agentSocket=${client.id} serverId=${serverId} requestId=${requestId} connected=${client.connected}`,
        );

        client.emit(DeploymentEvents.CONTAINER_DISCOVER, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private attachAgentInboundHandlers(client: Socket): void {
    client.removeAllListeners(DeploymentEvents.AGENT_HELLO);
    client.removeAllListeners(DeploymentEvents.CONTAINER_ACTION_RESULT);
    client.removeAllListeners(DeploymentEvents.CONTAINER_DISCOVER_RESULT);
    client.removeAllListeners(DeploymentEvents.SERVER_GET_RESOURCES_RESULT);
    client.removeAllListeners(DeploymentEvents.TERMINAL_CONNECT_RESULT);
    client.removeAllListeners(DeploymentEvents.TERMINAL_OUTPUT);
    client.removeAllListeners(DeploymentEvents.TERMINAL_DISCONNECT);
    client.removeAllListeners(DeploymentEvents.CONTAINER_LOGS_START_RESULT);
    client.removeAllListeners(DeploymentEvents.CONTAINER_LOGS_DATA);
    client.removeAllListeners(DeploymentEvents.CONTAINER_LOGS_ERROR);
    client.removeAllListeners(DeploymentEvents.CONTAINER_LOGS_STOP);
    client.on(DeploymentEvents.AGENT_HELLO, (payload: AgentHelloPayload) => {
      this.processAgentHello(client, payload);
    });
    client.on(
      DeploymentEvents.CONTAINER_ACTION_RESULT,
      (payload: ContainerActionResponsePayload) => {
        this.handleContainerActionResult(client, payload);
      },
    );
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
    client.on(
      DeploymentEvents.TERMINAL_CONNECT_RESULT,
      (payload: TerminalConnectResponsePayload) => {
        this.processTerminalConnectResult(client, payload);
      },
    );
    client.on(
      DeploymentEvents.TERMINAL_OUTPUT,
      (payload: TerminalOutputPayload) => {
        this.relayTerminalOutput(client, payload);
      },
    );
    client.on(
      DeploymentEvents.TERMINAL_DISCONNECT,
      (payload: TerminalDisconnectPayload) => {
        this.processAgentTerminalDisconnect(client, payload);
      },
    );
    client.on(
      DeploymentEvents.CONTAINER_LOGS_START_RESULT,
      (payload: ContainerLogsStartResponsePayload) => {
        this.processContainerLogsStartResult(client, payload);
      },
    );
    client.on(
      DeploymentEvents.CONTAINER_LOGS_DATA,
      (payload: ContainerLogsDataPayload) => {
        this.relayContainerLogsData(client, payload);
      },
    );
    client.on(
      DeploymentEvents.CONTAINER_LOGS_ERROR,
      (payload: ContainerLogsErrorPayload) => {
        this.relayContainerLogsError(client, payload);
      },
    );
    client.on(
      DeploymentEvents.CONTAINER_LOGS_STOP,
      (payload: ContainerLogsStopPayload) => {
        this.processAgentContainerLogsStop(client, payload);
      },
    );
  }

  /**
   * Processes an agent terminal disconnect.
   */
  private processAgentTerminalDisconnect(
    client: Socket,
    payload: TerminalDisconnectPayload,
  ): void {
    const sessionId = payload?.sessionId?.trim();
    if (!sessionId) {
      return;
    }

    const session = this.terminalSessionsById.get(sessionId);
    const serverId = this.serverIdBySocketId.get(client.id);
    if (session && serverId && serverId !== session.serverId) {
      return;
    }

    this.closeTerminalSession(sessionId, {
      notifyAgent: false,
      skipTransportClose: true,
    });
  }

  /**
   * Processes a terminal connect result.
   */
  private processTerminalConnectResult(
    client: Socket,
    payload: TerminalConnectResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        this.logger.warn(
          `Ignoring terminal connect result without requestId from ${client.id}`,
        );
        return;
      }

      const pending = this.pendingTerminalConnects.get(requestId);
      if (!pending) {
        this.logger.warn(
          `No pending terminal connect for requestId=${requestId}`,
        );
        return;
      }

      const serverId = this.serverIdBySocketId.get(client.id);
      if (serverId && serverId !== pending.serverId) {
        this.logger.warn(
          `Terminal connect result server mismatch requestId=${requestId} expected=${pending.serverId} got=${serverId}`,
        );
        return;
      }

      clearTimeout(pending.timer);
      this.pendingTerminalConnects.delete(requestId);

      if (payload.error) {
        pending.reject(new Error(payload.error));
        return;
      }

      const sessionId = payload.sessionId?.trim();
      if (!sessionId) {
        pending.reject(new Error("Agent returned no terminal session id"));
        return;
      }

      this.registerTerminalSession(
        sessionId,
        pending.serverId,
        pending.userId,
        TerminalTransport.AGENT,
      );
      pending.resolve(sessionId);
    } catch (error) {
      this.logger.error(
        `Failed to process terminal connect result: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Relays a terminal output.
   */
  private relayTerminalOutput(
    client: Socket,
    payload: TerminalOutputPayload,
  ): void {
    try {
      const sessionId = payload?.sessionId?.trim();
      const data = payload?.data;
      if (!sessionId || data == null) {
        return;
      }

      const serverId = this.serverIdBySocketId.get(client.id);
      const session = this.terminalSessionsById.get(sessionId);
      if (!session || (serverId && serverId !== session.serverId)) {
        return;
      }

      const ns = this.getNamespaceServer();
      if (!ns) {
        return;
      }

      ns.to(terminalRoom(sessionId)).emit(DeploymentEvents.TERMINAL_OUTPUT, {
        sessionId,
        data,
      });
    } catch (error) {
      this.logger.error(
        `Failed to relay terminal output: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Forwards a terminal event to the agent.
   */
  private forwardTerminalEventToAgent(
    client: Socket,
    event: DeploymentEvents.TERMINAL_INPUT | DeploymentEvents.TERMINAL_RESIZE,
    payload: TerminalInputPayload | TerminalResizePayload,
  ): void {
    try {
      const sessionId = payload?.sessionId?.trim();
      if (!sessionId) {
        return;
      }

      const session = this.terminalSessionsById.get(sessionId);
      if (!session) {
        this.logger.warn(
          `[TERMINAL] ${event} ignored for unknown sessionId=${sessionId} client=${client.id}`,
        );
        return;
      }

      if (session.transport === TerminalTransport.SSH) {
        if (event === DeploymentEvents.TERMINAL_INPUT) {
          const input = payload as TerminalInputPayload;
          if (input.data != null) {
            this.sshTerminalService.writeInput(sessionId, input.data);
          }
        } else {
          const resize = payload as TerminalResizePayload;
          this.sshTerminalService.resize(sessionId, resize.cols, resize.rows);
        }
        return;
      }

      const agent = this.agentsByServerId.get(session.serverId);
      if (!agent?.connected) {
        this.closeTerminalSession(sessionId, { notifyAgent: false });
        return;
      }

      agent.emit(event, payload);
    } catch (error) {
      this.logger.error(
        `Failed to forward terminal event ${event}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Rejects pending terminal connects for a server.
   */
  private rejectPendingTerminalConnectsForServer(
    serverId: string,
    reason: string,
  ): void {
    for (const [requestId, pending] of this.pendingTerminalConnects) {
      if (pending.serverId !== serverId) {
        continue;
      }
      clearTimeout(pending.timer);
      this.pendingTerminalConnects.delete(requestId);
      pending.reject(new Error(reason));
    }
  }

  /**
   * Closes terminal sessions for a server.
   */
  private closeTerminalSessionsForServer(
    serverId: string,
    reason: string,
  ): void {
    for (const [sessionId, session] of this.terminalSessionsById) {
      if (session.serverId !== serverId) {
        continue;
      }
      this.closeTerminalSession(sessionId, {
        notifyAgent: session.transport === TerminalTransport.AGENT,
      });
      this.logger.log(
        `[TERMINAL] closed sessionId=${sessionId} serverId=${serverId}: ${reason}`,
      );
    }
  }

  /**
   * Rejects pending container logs starts for a server.
   */
  private rejectPendingContainerLogsStartsForServer(
    serverId: string,
    reason: string,
  ): void {
    for (const [requestId, pending] of this.pendingContainerLogsStarts) {
      if (pending.serverId !== serverId) {
        continue;
      }
      clearTimeout(pending.timer);
      this.pendingContainerLogsStarts.delete(requestId);
      this.containerLogsSessionsById.delete(pending.sessionId);
      pending.reject(new Error(reason));
    }
  }

  /**
   * Closes container logs sessions for a server.
   */
  private closeContainerLogsSessionsForServer(
    serverId: string,
    reason: string,
  ): void {
    for (const [sessionId, session] of this.containerLogsSessionsById) {
      if (session.serverId !== serverId) {
        continue;
      }
      this.closeContainerLogsSession(sessionId, { notifyAgent: false });
      this.logger.log(
        `[CONTAINER_LOGS] closed sessionId=${sessionId} serverId=${serverId}: ${reason}`,
      );
    }
  }

  /**
   * Processes a container logs start result.
   */
  private processContainerLogsStartResult(
    client: Socket,
    payload: ContainerLogsStartResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        this.logger.warn(
          `Ignoring container logs start result without requestId from ${client.id}`,
        );
        return;
      }

      const pending = this.pendingContainerLogsStarts.get(requestId);
      if (!pending) {
        this.logger.warn(
          `No pending container logs start for requestId=${requestId}`,
        );
        return;
      }

      const serverId = this.serverIdBySocketId.get(client.id);
      if (serverId && serverId !== pending.serverId) {
        this.logger.warn(
          `Container logs start result server mismatch requestId=${requestId} expected=${pending.serverId} got=${serverId}`,
        );
        return;
      }

      clearTimeout(pending.timer);
      this.pendingContainerLogsStarts.delete(requestId);

      if (payload.error) {
        this.containerLogsSessionsById.delete(pending.sessionId);
        pending.reject(new Error(payload.error));
        return;
      }

      const sessionId = payload.sessionId?.trim();
      if (!sessionId) {
        this.containerLogsSessionsById.delete(pending.sessionId);
        pending.reject(
          new Error("Agent returned no container logs session id"),
        );
        return;
      }

      pending.resolve(sessionId);
    } catch (error) {
      this.logger.error(
        `Failed to process container logs start result: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Relays container logs data to the control panel.
   */
  private relayContainerLogsData(
    client: Socket,
    payload: ContainerLogsDataPayload,
  ): void {
    try {
      const sessionId = payload?.sessionId?.trim();
      const data = payload?.data;
      if (!sessionId || data == null) {
        return;
      }

      const serverId = this.serverIdBySocketId.get(client.id);
      const session = this.containerLogsSessionsById.get(sessionId);
      if (!session || (serverId && serverId !== session.serverId)) {
        return;
      }

      const ns = this.getNamespaceServer();
      if (!ns) {
        return;
      }

      ns.to(containerLogsRoom(sessionId)).emit(
        DeploymentEvents.CONTAINER_LOGS_DATA,
        { sessionId, data },
      );
    } catch (error) {
      this.logger.error(
        `Failed to relay container logs data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Relates container logs error to the control panel.
   */
  private relayContainerLogsError(
    client: Socket,
    payload: ContainerLogsErrorPayload,
  ): void {
    try {
      const sessionId = payload?.sessionId?.trim();
      const error = payload?.error?.trim();
      if (!sessionId || !error) {
        return;
      }

      const serverId = this.serverIdBySocketId.get(client.id);
      const session = this.containerLogsSessionsById.get(sessionId);
      if (!session || (serverId && serverId !== session.serverId)) {
        return;
      }

      const ns = this.getNamespaceServer();
      if (!ns) {
        return;
      }

      ns.to(containerLogsRoom(sessionId)).emit(
        DeploymentEvents.CONTAINER_LOGS_ERROR,
        { sessionId, error },
      );

      this.closeContainerLogsSession(sessionId, { notifyAgent: false });
    } catch (error) {
      this.logger.error(
        `Failed to relay container logs error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Processes a container logs stop request.
   */
  private processAgentContainerLogsStop(
    client: Socket,
    payload: ContainerLogsStopPayload,
  ): void {
    const sessionId = payload?.sessionId?.trim();
    if (!sessionId) {
      return;
    }

    const session = this.containerLogsSessionsById.get(sessionId);
    const serverId = this.serverIdBySocketId.get(client.id);
    if (session && serverId && serverId !== session.serverId) {
      return;
    }

    this.closeContainerLogsSession(sessionId, { notifyAgent: false });
  }

  /**
   * Rejects pending container discovery for a server.
   */
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

  /**
   * Rejects pending server resources for a server.
   */
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

  /**
   * Rejects pending container actions for a server.
   */
  private rejectPendingContainerActionsForServer(
    serverId: string,
    reason: string,
  ): void {
    for (const [requestId, pending] of this.pendingContainerActions) {
      if (pending.serverId !== serverId) {
        continue;
      }
      clearTimeout(pending.timer);
      this.pendingContainerActions.delete(requestId);
      pending.reject(new Error(reason));
    }
  }

  /**
   * Rejects pending deployment removes for a server.
   */
  private rejectPendingDeploymentRemovesForServer(
    serverId: string,
    reason: string,
  ): void {
    for (const [deploymentId, pending] of this.pendingDeploymentRemoves) {
      if (pending.serverId !== serverId) {
        continue;
      }
      clearTimeout(pending.timer);
      this.pendingDeploymentRemoves.delete(deploymentId);
      pending.reject(new Error(reason));
    }
  }

  private rejectPendingAgentRemovesForServer(
    serverId: string,
    reason: string,
  ): void {
    for (const [requestId, pending] of this.pendingAgentRemoves) {
      if (pending.serverId !== serverId) {
        continue;
      }
      clearTimeout(pending.timer);
      this.pendingAgentRemoves.delete(requestId);
      pending.reject(new Error(reason));
    }
  }

  /**
   * Checks if an agent is connected for a server.
   */
  isAgentConnectedForServer(serverId: string): boolean {
    try {
      const client = this.agentsByServerId.get(serverId);
      return Boolean(client?.connected);
    } catch (error) {
      this.logger.error(
        `Failed to check agent for server '${serverId}': ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Checks if an agent supports a capability.
   */
  agentSupports(serverId: string, capability: string): boolean {
    const capabilities = this.agentCapabilitiesByServerId.get(serverId);
    return Boolean(capabilities?.has(capability));
  }

  /**
   * Gets the version of an agent for a server.
   */
  getAgentVersion(serverId: string): string | null {
    return this.agentVersionsByServerId.get(serverId) ?? null;
  }

  /**
   * Processes an agent hello message.
   */
  private processAgentHello(client: Socket, payload: AgentHelloPayload): void {
    try {
      const serverId = this.serverIdBySocketId.get(client.id);
      const capabilities = new Set(payload?.capabilities ?? []);
      const version = payload?.version?.trim() || "unknown";

      if (serverId) {
        this.agentCapabilitiesByServerId.set(serverId, capabilities);
        this.agentVersionsByServerId.set(serverId, version);
      }

      this.logger.log(
        `[AgentHello] received from agentSocket=${client.id}` +
          (serverId ? ` serverId=${serverId}` : " (unbound)") +
          ` version=${version} capabilities=[${[...capabilities].join(", ")}]` +
          ` supportsContainerAction=${capabilities.has(DeploymentEvents.CONTAINER_ACTION)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process agent hello: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clears agent metadata for a server.
   */
  private clearAgentMetadataForServer(serverId: string): void {
    this.agentCapabilitiesByServerId.delete(serverId);
    this.agentVersionsByServerId.delete(serverId);
  }

  /**
   * Gets the connected agents.
   */
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

  /**
   * Gets the number of connected agents.
   */
  getConnectedAgentsCount(): number {
    return this.connectedAgents.size;
  }

  /**
   * Gets the primary agent public IP.
   */
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

  /**
   * Extracts the public IP from a handshake.
   */
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

  /**
   * Extracts the server ID from a handshake.
   */
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

  /**
   * Unregisters a server binding.
   */
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
