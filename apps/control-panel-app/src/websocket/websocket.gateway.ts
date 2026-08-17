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
  DeploymentStatus,
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
  DeploymentValidateRequestPayload,
  DeploymentValidateResponsePayload,
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
  ServerOperationUpdatedPayload,
} from "@shared/socket-events";
import { randomUUID } from "node:crypto";
import { DeploymentsService } from "@control-panel/modules/deployments/deployments.service";
import { AgentServerBindingService } from "@control-panel/modules/server-connections/services/agent-server-binding.service";
import { ServerConnectionsService } from "@control-panel/modules/server-connections/services/server-connections.service";
import { SshTerminalService } from "@control-panel/modules/terminal/ssh-terminal.service";
import { TerminalTransport } from "@control-panel/modules/terminal/enums/terminal-transport.enum";
import { DeploymentStreamBufferService } from "./deployment-stream-buffer.service";
import type {
  PendingContainerAction,
  PendingContainerDiscovery,
  PendingContainerLogsStart,
  PendingDeploymentRemove,
  PendingAgentRemove,
  PendingDeploymentValidate,
  PendingServerResources,
  PendingTerminalConnect,
  TerminalSessionRecord,
  ContainerLogsSessionRecord,
} from "./interfaces";
import {
  DEPLOYMENTS_SOCKET_NAMESPACE,
  SOCKET_ROOM_PREFIX,
  SERVER_ID_HEADER,
  CONTAINER_ACTION_TIMEOUT_MS,
  CONTAINER_DISCOVER_TIMEOUT_MS,
  DEPLOYMENT_VALIDATE_TIMEOUT_MS,
  CONTAINER_LOGS_START_TIMEOUT_MS,
  DEPLOYMENT_REMOVE_TIMEOUT_MS,
  AGENT_REMOVE_TIMEOUT_MS,
  SERVER_GET_RESOURCES_TIMEOUT_MS,
  TERMINAL_CONNECT_TIMEOUT_MS,
  STREAM_DEBUG,
} from "./constants";
import { WEBSOCKET_ERROR_MESSAGES } from "./constants/error-messages.constants";
import {
  logSocketEmit,
  logSocketError,
  logSocketLifecycle,
  logSocketTimeout,
  formatSocketDebug,
} from "./utils/socket-log.util";
import { logStructuredError, type LogContext } from "@shared/common";

/**
 * Builds the Socket.io room name for a deployment log stream.
 */
function deploymentRoom(deploymentId: string): string {
  return `${SOCKET_ROOM_PREFIX.DEPLOYMENT}:${deploymentId}`;
}

/**
 * Builds the Socket.io room name for a terminal session.
 */
function terminalRoom(sessionId: string): string {
  return `${SOCKET_ROOM_PREFIX.TERMINAL}:${sessionId}`;
}

/**
 * Builds the Socket.io room name for a container logs session.
 */
function containerLogsRoom(sessionId: string): string {
  return `${SOCKET_ROOM_PREFIX.CONTAINER_LOGS}:${sessionId}`;
}

@Injectable()
@WebSocketGateway({
  namespace: DEPLOYMENTS_SOCKET_NAMESPACE,
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
    @Inject(forwardRef(() => ServerConnectionsService))
    private readonly serverConnectionsService: ServerConnectionsService,
  ) {}

  @WebSocketServer()
  server!: Server;

  /** Agent socket registry: socketId → socket (multiple agents). */
  private connectedAgents = new Map<string, Socket>();
  private agentPublicIps = new Map<string, string>();
  /**
   * serverId → live agent socket.
   * One socket may be registered under many serverIds (shared host).
   */
  private agentsByServerId = new Map<string, Socket>();
  /** socketId → primary serverId (for logs / legacy single-id paths). */
  private serverIdBySocketId = new Map<string, string>();
  /** socketId → all serverIds this agent currently serves. */
  private serverIdsBySocketId = new Map<string, Set<string>>();
  private readonly pendingContainerDiscovery = new Map<
    string,
    PendingContainerDiscovery
  >();
  private readonly pendingServerResources = new Map<
    string,
    PendingServerResources
  >();
  private readonly pendingDeploymentValidations = new Map<
    string,
    PendingDeploymentValidate
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

  /**
   * Initializes the WebSocket gateway after the namespace server is ready.
   */
  afterInit(): void {
    try {
      if (STREAM_DEBUG) {
        this.logger.debug(formatSocketDebug("afterInit"));
      }
    } catch (error) {
      logSocketError(this.logger, "socket.gateway_init", error);
    }
  }

  /**
   * Handles the connection of a client to the deployment gateway.
   * @param client - The socket client.
   * @returns A promise that resolves when the connection is handled.
   * @throws An error if the connection cannot be handled.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const socketId = client.id;
      const isAgent = this.isLikelyAgentClient(client);

      if (!isAgent) {
        return;
      }

      const publicIp = this.extractPublicIpFromHandshake(client);
      const explicitServerId = this.extractServerIdFromHandshake(client);
      const serverIds =
        await this.agentServerBinding.resolveSharedHostServerIds({
          explicitServerId,
          reportedPublicIp: publicIp || null,
        });

      this.connectedAgents.set(socketId, client);
      if (publicIp) {
        this.agentPublicIps.set(socketId, publicIp);
      }

      if (serverIds.length > 0) {
        this.registerAgentSocketForServers(client, serverIds);
      }

      this.attachAgentInboundHandlers(client);
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

      // Announce each bound server so every sharing user sees the agent online.
      const ns = this.getNamespaceServer();
      const announceIds = serverIds.length > 0 ? serverIds : [undefined];
      for (const boundServerId of announceIds) {
        ns?.emit(DeploymentEvents.AGENT_CONNECTED, {
          agentId: socketId,
          serverId: boundServerId,
          timestamp: new Date().toISOString(),
          totalAgents: this.connectedAgents.size,
        });

        if (boundServerId) {
          await this.serverConnectionsService.handleAgentConnected(
            boundServerId,
          );
        }
      }

      logSocketLifecycle(this.logger, "client_connected", {
        socketId,
        serverId: serverIds[0] ?? undefined,
        agentSocket: socketId,
        totalAgents: this.connectedAgents.size,
      });
    } catch (error) {
      logSocketError(this.logger, "socket.handle_connection", error, {
        socketId: client.id,
      });
      client.disconnect(true);
    }
  }

  /**
   * Handles the disconnection of a client from the deployment gateway.
   * @param client - The socket client.
   * @returns A promise that resolves when the disconnection is handled.
   */
  handleDisconnect(client: Socket): void {
    try {
      const socketId = client.id;
      const wasAgent = this.connectedAgents.has(socketId);
      const serverIds = this.getBoundServerIds(socketId);

      this.connectedAgents.delete(socketId);
      this.agentPublicIps.delete(socketId);
      this.unregisterServerBinding(socketId);

      if (!wasAgent) {
        return;
      }

      this.clearPendingOpsForBoundServers(serverIds);

      const ns = this.getNamespaceServer();
      for (const boundServerId of serverIds.length > 0
        ? serverIds
        : [undefined]) {
        ns?.emit(DeploymentEvents.AGENT_DISCONNECTED, {
          agentId: socketId,
          serverId: boundServerId,
          timestamp: new Date().toISOString(),
          totalAgents: this.connectedAgents.size,
        });
      }

      logSocketLifecycle(this.logger, "client_disconnected", {
        socketId,
        serverId: serverIds[0] ?? undefined,
        agentSocket: socketId,
        totalAgents: this.connectedAgents.size,
      });
    } catch (error) {
      logSocketError(this.logger, "socket.handle_disconnect", error, {
        socketId: client.id,
      });
    }
  }

  /**
   * Handles the deployment log event from an agent.
   * @param client - The socket client.
   * @param payload - The deployment log payload.
   * @returns A promise that resolves when the deployment log is handled.
   */
  @SubscribeMessage(DeploymentEvents.DEPLOYMENT_LOG)
  handleDeploymentLog(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DeploymentLogPayload,
  ): void {
    try {
      this.processAgentLog(client, payload);
    } catch (error) {
      this.logHandlerError("socket.handle_deployment_log", error);
    }
  }

  /**
   * Handles the deployment status event from an agent.
   * @param client - The socket client.
   * @param payload - The deployment status payload.
   * @returns A promise that resolves when the deployment status is handled.
   */
  @SubscribeMessage(DeploymentEvents.DEPLOYMENT_STATUS)
  async handleDeploymentStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DeploymentStatusPayload,
  ): Promise<void> {
    try {
      await this.processDeploymentStatus(client, payload);
    } catch (error) {
      this.logHandlerError("socket.handle_deployment_status", error);
    }
  }

  /**
   * Handles the agent hello event from an agent.
   * @param client - The socket client.
   * @param payload - The agent hello payload.
   * @returns A promise that resolves when the agent hello is handled.
   */
  @SubscribeMessage(DeploymentEvents.AGENT_HELLO)
  handleAgentHello(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AgentHelloPayload,
  ): void {
    try {
      this.processAgentHello(client, payload);
    } catch (error) {
      this.logHandlerError("socket.handle_agent_hello", error);
    }
  }

  /**
   * Handles the server get resources result event from an agent.
   * @param client - The socket client.
   * @param payload - The server get resources result payload.
   * @returns A promise that resolves when the server get resources result is handled.
   */
  @SubscribeMessage(DeploymentEvents.SERVER_GET_RESOURCES_RESULT)
  handleServerGetResourcesResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ServerGetResourcesResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        return;
      }

      const pending = this.pendingServerResources.get(requestId);
      if (!pending) {
        return;
      }

      if (!this.isSocketServingServer(client, pending.serverId)) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingServerResources.delete(requestId);

      if (payload.error) {
        pending.reject(new Error(payload.error));
        return;
      }

      if (!payload.resources) {
        pending.reject(
          new Error(
            WEBSOCKET_ERROR_MESSAGES.AGENT_RETURNED_NO_SERVER_RESOURCES,
          ),
        );
        return;
      }

      logSocketLifecycle(this.logger, "event_acknowledged", {
        event: DeploymentEvents.SERVER_GET_RESOURCES_RESULT,
        requestId,
        serverId: pending.serverId,
      });
      pending.resolve(payload.resources);
    } catch (error) {
      this.logHandlerError("socket.server_get_resources_result", error);
    }
  }

  /**
   * Handles the deployment validate result event from an agent.
   * @param client - The socket client.
   * @param payload - The deployment validate result payload.
   * @returns A promise that resolves when the deployment validate result is handled.
   */
  @SubscribeMessage(DeploymentEvents.DEPLOYMENT_VALIDATE_RESULT)
  handleDeploymentValidateResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DeploymentValidateResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        return;
      }

      const pending = this.pendingDeploymentValidations.get(requestId);
      if (!pending) {
        return;
      }

      if (!this.isSocketServingServer(client, pending.serverId)) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingDeploymentValidations.delete(requestId);
      logSocketLifecycle(this.logger, "event_acknowledged", {
        event: DeploymentEvents.DEPLOYMENT_VALIDATE_RESULT,
        requestId,
        serverId: pending.serverId,
      });
      pending.resolve(payload);
    } catch (error) {
      this.logHandlerError("socket.deployment_validate_result", error);
    }
  }

  /**
   * Handles the agent remove result event from an agent.
   * @param client - The socket client.
   * @param payload - The agent remove result payload.
   * @returns A promise that resolves when the agent remove result is handled.
   */
  @SubscribeMessage(DeploymentEvents.AGENT_REMOVE_RESULT)
  handleAgentRemoveResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AgentRemoveResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        return;
      }

      const pending = this.pendingAgentRemoves.get(requestId);
      if (!pending) {
        return;
      }

      if (!this.isSocketServingServer(client, pending.serverId)) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingAgentRemoves.delete(requestId);

      if (!payload.success) {
        pending.reject(
          new Error(
            payload.error?.trim() ||
              WEBSOCKET_ERROR_MESSAGES.AGENT_REMOVAL_FAILED,
          ),
        );
        return;
      }

      pending.resolve({ imageRefs: payload.imageRefs ?? [] });
    } catch (error) {
      this.logHandlerError("socket.agent_remove_result", error);
    }
  }

  /**
   * Handles the container action result event from an agent.
   * @param client - The socket client.
   * @param payload - The container action result payload.
   * @returns A promise that resolves when the container action result is handled.
   */
  @SubscribeMessage(DeploymentEvents.CONTAINER_ACTION_RESULT)
  handleContainerActionResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ContainerActionResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        return;
      }

      const pending = this.pendingContainerActions.get(requestId);
      if (!pending) {
        return;
      }

      if (!this.isSocketServingServer(client, pending.serverId)) {
        return;
      }

      clearTimeout(pending.timer);
      this.pendingContainerActions.delete(requestId);
      logSocketLifecycle(this.logger, "event_acknowledged", {
        event: DeploymentEvents.CONTAINER_ACTION_RESULT,
        requestId,
        serverId: pending.serverId,
      });
      pending.resolve(payload);
    } catch (error) {
      this.logHandlerError("socket.container_action_result", error);
    }
  }

  /**
   * Handles the container discover result event from an agent.
   * @param client - The socket client.
   * @param payload - The container discover result payload.
   * @returns A promise that resolves when the container discover result is handled.
   */
  @SubscribeMessage(DeploymentEvents.CONTAINER_DISCOVER_RESULT)
  handleContainerDiscoverResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ContainerDiscoverResponsePayload,
  ): void {
    try {
      const requestId = payload?.requestId?.trim();
      if (!requestId) {
        return;
      }

      const pending = this.pendingContainerDiscovery.get(requestId);
      if (!pending) {
        return;
      }

      if (!this.isSocketServingServer(client, pending.serverId)) {
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
      this.logHandlerError("socket.container_discover_result", error);
    }
  }

  /**
   * Handles the logs subscribe event from a client.
   * @param client - The socket client.
   * @param body - The logs subscribe payload.
   * @returns A promise that resolves when the logs subscribe is handled.
   */
  @SubscribeMessage(DeploymentEvents.LOGS_SUBSCRIBE)
  async handleLogsSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: LogsSubscribePayload,
  ): Promise<void> {
    try {
      const deploymentId = body?.deploymentId?.trim();
      if (!deploymentId) {
        return;
      }

      const room = deploymentRoom(deploymentId);

      try {
        await client.join(room);
      } catch (error) {
        logSocketError(this.logger, "socket.logs_subscribe.join_room", error, {
          socketId: client.id,
          deploymentId,
          room,
        });
        return;
      }

      logSocketLifecycle(this.logger, "room_joined", {
        socketId: client.id,
        deploymentId,
        room,
        event: DeploymentEvents.LOGS_SUBSCRIBE,
      });

      this.logStreamDiagnostics("logs:subscribe", {
        socketId: client.id,
        deploymentId,
        room,
      });

      this.replayBufferedLogsToClient(client, deploymentId);
    } catch (error) {
      this.logHandlerError("socket.logs_subscribe", error);
    }
  }

  /**
   * Handles the terminal subscribe event from a client.
   * @param client - The socket client.
   * @param body - The terminal subscribe payload.
   * @returns A promise that resolves when the terminal subscribe is handled.
   */
  @SubscribeMessage(DeploymentEvents.TERMINAL_SUBSCRIBE)
  async handleTerminalSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: TerminalSubscribePayload,
  ): Promise<void> {
    try {
      const sessionId = body?.sessionId?.trim();
      if (!sessionId || !this.terminalSessionsById.has(sessionId)) {
        return;
      }

      const room = terminalRoom(sessionId);
      try {
        await client.join(room);
        logSocketLifecycle(this.logger, "room_joined", {
          socketId: client.id,
          sessionId,
          room,
          event: DeploymentEvents.TERMINAL_SUBSCRIBE,
        });
      } catch (error) {
        logSocketError(
          this.logger,
          "socket.terminal_subscribe.join_room",
          error,
          {
            socketId: client.id,
            sessionId,
            room,
          },
        );
      }
    } catch (error) {
      this.logHandlerError("socket.terminal_subscribe", error);
    }
  }

  /**
   * Handles the container logs subscribe event from a client.
   * @param client - The socket client.
   * @param body - The container logs subscribe payload.
   * @returns A promise that resolves when the container logs subscribe is handled.
   */
  @SubscribeMessage(DeploymentEvents.CONTAINER_LOGS_SUBSCRIBE)
  async handleContainerLogsSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ContainerLogsSubscribePayload,
  ): Promise<void> {
    try {
      const sessionId = body?.sessionId?.trim();
      if (!sessionId || !this.containerLogsSessionsById.has(sessionId)) {
        return;
      }

      const room = containerLogsRoom(sessionId);
      try {
        await client.join(room);
        logSocketLifecycle(this.logger, "room_joined", {
          socketId: client.id,
          sessionId,
          room,
          event: DeploymentEvents.CONTAINER_LOGS_SUBSCRIBE,
        });
      } catch (error) {
        logSocketError(
          this.logger,
          "socket.container_logs_subscribe.join_room",
          error,
          {
            socketId: client.id,
            sessionId,
            room,
          },
        );
      }
    } catch (error) {
      this.logHandlerError("socket.container_logs_subscribe", error);
    }
  }

  /**
   * Handles the container logs stop event from a client.
   * @param payload - The container logs stop payload.
   * @returns A promise that resolves when the container logs stop is handled.
   */
  @SubscribeMessage(DeploymentEvents.CONTAINER_LOGS_STOP)
  handleContainerLogsStopFromConsole(
    @MessageBody() payload: ContainerLogsStopPayload,
  ): void {
    try {
      const sessionId = payload?.sessionId?.trim();
      if (!sessionId) {
        return;
      }

      this.closeContainerLogsSession(sessionId, { notifyAgent: true });
    } catch (error) {
      this.logHandlerError("socket.container_logs_stop", error);
    }
  }

  /**
   * Handles the terminal input event from a client.
   * @param client - The socket client.
   * @param payload - The terminal input payload.
   * @returns A promise that resolves when the terminal input is handled.
   */
  @SubscribeMessage(DeploymentEvents.TERMINAL_INPUT)
  handleTerminalInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalInputPayload,
  ): void {
    try {
      this.forwardTerminalEventToAgent(
        client,
        DeploymentEvents.TERMINAL_INPUT,
        payload,
      );
    } catch (error) {
      this.logHandlerError("socket.terminal_input", error);
    }
  }

  /**
   * Handles the terminal resize event from a client.
   * @param client - The socket client.
   * @param payload - The terminal resize payload.
   * @returns A promise that resolves when the terminal resize is handled.
   */
  @SubscribeMessage(DeploymentEvents.TERMINAL_RESIZE)
  handleTerminalResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalResizePayload,
  ): void {
    try {
      this.forwardTerminalEventToAgent(
        client,
        DeploymentEvents.TERMINAL_RESIZE,
        payload,
      );
    } catch (error) {
      this.logHandlerError("socket.terminal_resize", error);
    }
  }

  /**
   * Handles the terminal disconnect event from a client.
   * @param client - The socket client.
   * @param payload - The terminal disconnect payload.
   * @returns A promise that resolves when the terminal disconnect is handled.
   */
  @SubscribeMessage(DeploymentEvents.TERMINAL_DISCONNECT)
  handleTerminalDisconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalDisconnectPayload,
  ): void {
    try {
      const sessionId = payload?.sessionId?.trim();
      if (!sessionId) {
        return;
      }

      this.closeTerminalSession(sessionId, { notifyAgent: true });
    } catch (error) {
      this.logHandlerError("socket.terminal_disconnect", error);
    }
  }

  /**
   * Handles the terminal connect result event from a client.
   * @param client - The socket client.
   * @param payload - The terminal connect result payload.
   * @returns A promise that resolves when the terminal connect result is handled.
   */
  @SubscribeMessage(DeploymentEvents.TERMINAL_CONNECT_RESULT)
  handleTerminalConnectResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalConnectResponsePayload,
  ): void {
    try {
      this.processTerminalConnectResult(client, payload);
    } catch (error) {
      this.logHandlerError("socket.terminal_connect_result", error);
    }
  }

  /**
   * Handles the terminal output event from a client.
   * @param client - The socket client.
   * @param payload - The terminal output payload.
   * @returns A promise that resolves when the terminal output is handled.
   */
  @SubscribeMessage(DeploymentEvents.TERMINAL_OUTPUT)
  handleTerminalOutput(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalOutputPayload,
  ): void {
    try {
      this.relayTerminalOutput(client, payload);
    } catch (error) {
      this.logHandlerError("socket.terminal_output", error);
    }
  }

  /**
   * Checks if the client is likely an agent client.
   * @param client - The socket client.
   * @returns A boolean indicating if the client is likely an agent client.
   */
  private isLikelyAgentClient(client: Socket): boolean {
    try {
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
    } catch (error) {
      this.logHandlerError("socket.detect_agent_client", error);
      return false;
    }
  }

  /**
   * Processes an agent log.
   * @param client - The socket client.
   * @param payload - The agent log payload.
   * @returns A promise that resolves when the agent log is handled.
   */
  private processAgentLog(client: Socket, payload: DeploymentLogPayload): void {
    try {
      if (!payload?.message) {
        return;
      }

      if (!payload.deploymentId) {
        return;
      }

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
      this.logHandlerError("socket.process_agent_log", error);
    }
  }

  /**
   * Processes a deployment status event.
   * @param client - The socket client.
   * @param payload - The deployment status payload.
   * @returns A promise that resolves when the deployment status is handled.
   */
  private async processDeploymentStatus(
    client: Socket,
    payload: DeploymentStatusPayload,
  ): Promise<void> {
    try {
      if (!payload?.deploymentId) {
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
          if (payload.status === DeploymentStatus.REMOVED) {
            clearTimeout(pendingRemove.timer);
            this.pendingDeploymentRemoves.delete(payload.deploymentId);
            pendingRemove.resolve();
          } else if (payload.status === DeploymentStatus.FAILED) {
            clearTimeout(pendingRemove.timer);
            this.pendingDeploymentRemoves.delete(payload.deploymentId);
            pendingRemove.reject(
              new Error(
                payload.error?.trim() ||
                  payload.message?.trim() ||
                  WEBSOCKET_ERROR_MESSAGES.DEPLOYMENT_REMOVAL_FAILED,
              ),
            );
          }
        }

        if (payload.status === DeploymentStatus.REMOVED) {
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
        this.logHandlerError("socket.persist_deployment_status", error, {
          deploymentId: payload.deploymentId,
        });
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

      logSocketLifecycle(this.logger, "event_dispatched", {
        event: DeploymentEvents.DEPLOYMENT_STATUS,
        deploymentId: payload.deploymentId,
        serverId: serverId ?? undefined,
        status: payload.status,
        room,
      });
      ns.emit(DeploymentEvents.DEPLOYMENT_STATUS, enriched);
      ns.to(room).emit(DeploymentEvents.DEPLOYMENT_STATUS, enriched);
    } catch (error) {
      this.logHandlerError("socket.process_deployment_status", error);
    }
  }
  /**
   * Broadcasts a server operation update to all connected clients.
   */
  broadcastServerOperationUpdated(
    payload: ServerOperationUpdatedPayload,
  ): void {
    try {
      const ns = this.getNamespaceServer();
      if (!ns) {
        return;
      }

      const enriched: ServerOperationUpdatedPayload = {
        ...payload,
        timestamp: payload.timestamp ?? new Date().toISOString(),
      };

      logSocketEmit(this.logger, DeploymentEvents.SERVER_OPERATION_UPDATED, {
        serverId: enriched.serverId,
        status: String(enriched.operationStatus),
      });
      ns.emit(DeploymentEvents.SERVER_OPERATION_UPDATED, enriched);
    } catch (error) {
      this.logHandlerError("socket.broadcast_server_operation", error);
    }
  }

  /**
   * Broadcasts a deployment log line to subscribed console clients.
   */
  broadcastDeploymentLog(
    payload: DeploymentLogPayload & {
      serverId: string;
      deploymentId: string;
      phase?: DeploymentLogStreamPayload["phase"];
    },
  ): void {
    try {
      const message = payload.message?.trim();
      if (!message) {
        return;
      }

      const phase = payload.phase ?? "install";

      this.emitStreamPayload({
        deploymentId: payload.deploymentId,
        serverId: payload.serverId,
        phase,
        source: phase === "install" ? "install" : "deployment",
        stream: payload.type,
        timestamp: payload.timestamp ?? new Date().toISOString(),
        message,
      });
    } catch (error) {
      this.logHandlerError("socket.broadcast_deployment_log", error);
    }
  }

  /**
   * Normalizes and emits a deployment log stream payload to clients.
   */
  private emitStreamPayload(
    input: Omit<DeploymentLogStreamPayload, "stream"> & {
      stream?: DeploymentLogStreamType;
    },
  ): void {
    const deploymentId = input.deploymentId?.trim();
    if (!deploymentId) {
      return;
    }

    const ns = this.getNamespaceServer();
    if (!ns) {
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

      ns.emit(DeploymentEvents.DEPLOYMENT_STREAM, normalized);
    } catch (error) {
      this.logHandlerError("socket.emit_deployment_log", error);
    }
  }

  /**
   * Replays buffered deployment logs to a client that just subscribed.
   */
  private replayBufferedLogsToClient(
    client: Socket,
    deploymentId: string,
  ): void {
    try {
      const buffered = this.streamBuffer.get(deploymentId);
      if (buffered.length === 0) {
        return;
      }

      for (const entry of buffered) {
        client.emit(DeploymentEvents.DEPLOYMENT_STREAM, entry);
      }
    } catch (error) {
      this.logHandlerError("socket.replay_buffered_logs", error);
    }
  }

  /**
   * Returns the deployments namespace server instance.
   */
  private getNamespaceServer(): Server | null {
    try {
      return this.server ?? null;
    } catch (error) {
      this.logHandlerError("socket.get_namespace_server", error);
      return null;
    }
  }

  /**
   * Writes optional stream diagnostics when STREAM_DEBUG is enabled.
   */
  private logHandlerError(
    operation: string,
    error: unknown,
    context?: LogContext,
  ): void {
    logStructuredError(this.logger, operation, error, {
      module: "DeploymentGateway",
      ...context,
    });
  }

  private logStreamDiagnostics(
    context: string,
    extra?: Record<string, unknown>,
  ): void {
    try {
      if (!STREAM_DEBUG) {
        return;
      }

      this.logger.debug(formatSocketDebug(context, extra));
    } catch (error) {
      logSocketError(this.logger, "socket.stream_diagnostics", error);
    }
  }

  /**
   * Emits a deployment removal request to the connected agent.
   */
  emitRemove(message: SocketRemoveMessage, serverId: string): void {
    try {
      const client = this.agentsByServerId.get(serverId);
      if (!client) {
        throw new Error(
          WEBSOCKET_ERROR_MESSAGES.NO_CONNECTED_AGENT_FOR_DEPLOYMENT(
            serverId,
            message.payload.deploymentId,
          ),
        );
      }

      logSocketEmit(this.logger, DeploymentEvents.REMOVE, {
        serverId,
        deploymentId: message.payload.deploymentId,
      });
      client.emit(DeploymentEvents.REMOVE, message);
    } catch (error) {
      logStructuredError(this.logger, "socket.emit_remove", error, {
        module: "DeploymentGateway",
        serverId,
        deploymentId: message.payload.deploymentId,
      });
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
          reject(
            new Error(WEBSOCKET_ERROR_MESSAGES.NO_CONNECTED_AGENT(serverId)),
          );
          return;
        }

        const timer = setTimeout(() => {
          this.pendingDeploymentRemoves.delete(deploymentId);
          logSocketTimeout(this.logger, "socket.deployment_remove", {
            serverId,
            deploymentId,
          });
          reject(
            new Error(
              WEBSOCKET_ERROR_MESSAGES.TIMEOUT.DEPLOYMENT_REMOVE(
                timeoutMs / 1000,
                serverId,
              ),
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

        logSocketEmit(this.logger, DeploymentEvents.REMOVE, {
          deploymentId,
          serverId,
        });
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
          reject(
            new Error(WEBSOCKET_ERROR_MESSAGES.NO_CONNECTED_AGENT(serverId)),
          );
          return;
        }

        if (!this.agentSupports(serverId, DeploymentEvents.AGENT_REMOVE)) {
          reject(
            new Error(
              WEBSOCKET_ERROR_MESSAGES.AGENT_DOES_NOT_SUPPORT_REMOVAL(serverId),
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
          logSocketTimeout(this.logger, "socket.agent_remove", {
            serverId,
            requestId,
          });
          reject(
            new Error(
              WEBSOCKET_ERROR_MESSAGES.TIMEOUT.AGENT_REMOVE(
                timeoutMs / 1000,
                serverId,
              ),
            ),
          );
        }, timeoutMs);

        this.pendingAgentRemoves.set(requestId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        logSocketEmit(this.logger, DeploymentEvents.AGENT_REMOVE, {
          serverId,
          requestId,
        });
        client.emit(DeploymentEvents.AGENT_REMOVE, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Emits a deployment request to the connected agent.
   */
  emitDeploy(message: SocketDeployMessage, serverId: string): void {
    try {
      const client = this.agentsByServerId.get(serverId);
      if (!client) {
        throw new Error(
          WEBSOCKET_ERROR_MESSAGES.NO_CONNECTED_AGENT_FOR_TEMPLATE(
            serverId,
            message.payload.name,
          ),
        );
      }

      if (!client.connected) {
        throw new Error(
          WEBSOCKET_ERROR_MESSAGES.AGENT_NOT_CONNECTED(
            serverId,
            message.payload.name,
          ),
        );
      }

      logSocketEmit(this.logger, DeploymentEvents.DEPLOY, {
        deploymentId: message.payload.deploymentId ?? undefined,
        serverId,
        template: message.payload.name,
        agentSocket: client.id,
      });
      client.emit(DeploymentEvents.DEPLOY, message);
    } catch (error) {
      logStructuredError(this.logger, "socket.emit_deploy", error, {
        module: "DeploymentGateway",
        serverId,
        deploymentId: message.payload.deploymentId ?? undefined,
        template: message.payload.name,
      });
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
          reject(
            new Error(WEBSOCKET_ERROR_MESSAGES.NO_CONNECTED_AGENT(serverId)),
          );
          return;
        }

        const requestId = randomUUID();
        const payload: ServerGetResourcesRequestPayload = { requestId };

        const timer = setTimeout(() => {
          this.pendingServerResources.delete(requestId);
          logSocketTimeout(this.logger, "socket.server_get_resources", {
            serverId,
            requestId,
          });
          reject(
            new Error(
              WEBSOCKET_ERROR_MESSAGES.TIMEOUT.SERVER_RESOURCES(
                timeoutMs / 1000,
                serverId,
              ),
            ),
          );
        }, timeoutMs);

        this.pendingServerResources.set(requestId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        logSocketEmit(this.logger, DeploymentEvents.SERVER_GET_RESOURCES, {
          agentSocket: client.id,
          serverId,
          requestId,
        });

        client.emit(DeploymentEvents.SERVER_GET_RESOURCES, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Requests pre-deploy validation (RAM, ports, CPU) from the connected agent.
   */
  requestDeploymentValidate(
    serverId: string,
    payload: DeploymentValidateRequestPayload,
    timeoutMs: number = DEPLOYMENT_VALIDATE_TIMEOUT_MS,
  ): Promise<DeploymentValidateResponsePayload> {
    return new Promise((resolve, reject) => {
      try {
        const client = this.agentsByServerId.get(serverId);
        if (!client?.connected) {
          reject(
            new Error(WEBSOCKET_ERROR_MESSAGES.NO_CONNECTED_AGENT(serverId)),
          );
          return;
        }

        const requestId = payload.requestId?.trim();
        if (!requestId) {
          reject(
            new Error(
              WEBSOCKET_ERROR_MESSAGES.MISSING_REQUEST_ID_FOR_DEPLOYMENT_VALIDATION,
            ),
          );
          return;
        }

        const timer = setTimeout(() => {
          this.pendingDeploymentValidations.delete(requestId);
          logSocketTimeout(this.logger, "socket.deployment_validate", {
            serverId,
            requestId,
            template: payload.templateSlug,
          });
          reject(
            new Error(
              WEBSOCKET_ERROR_MESSAGES.TIMEOUT.DEPLOYMENT_VALIDATE(
                timeoutMs / 1000,
                serverId,
              ),
            ),
          );
        }, timeoutMs);

        this.pendingDeploymentValidations.set(requestId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        logSocketEmit(this.logger, DeploymentEvents.DEPLOYMENT_VALIDATE, {
          agentSocket: client.id,
          serverId,
          requestId,
          template: payload.templateSlug,
        });

        client.emit(DeploymentEvents.DEPLOYMENT_VALIDATE, payload);
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
          reject(
            new Error(WEBSOCKET_ERROR_MESSAGES.NO_CONNECTED_AGENT(serverId)),
          );
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
          logSocketTimeout(this.logger, "socket.container_action", {
            serverId,
            requestId,
            containerId,
            action,
          });
          reject(
            new Error(
              WEBSOCKET_ERROR_MESSAGES.TIMEOUT.CONTAINER_ACTION(
                timeoutMs / 1000,
                serverId,
              ),
            ),
          );
        }, timeoutMs);

        this.pendingContainerActions.set(requestId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        logSocketEmit(this.logger, DeploymentEvents.CONTAINER_ACTION, {
          agentSocket: client.id,
          serverId,
          action,
          containerId,
          requestId,
        });

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
          reject(
            new Error(WEBSOCKET_ERROR_MESSAGES.NO_CONNECTED_AGENT(serverId)),
          );
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
          logSocketTimeout(this.logger, "socket.terminal_connect", {
            serverId,
            requestId,
            userId,
          });
          reject(
            new Error(
              WEBSOCKET_ERROR_MESSAGES.TIMEOUT.TERMINAL_CONNECT(
                timeoutMs / 1000,
                serverId,
              ),
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

        logSocketEmit(this.logger, DeploymentEvents.TERMINAL_CONNECT, {
          agentSocket: client.id,
          serverId,
          requestId,
          userId,
        });

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
    try {
      this.terminalSessionsById.set(sessionId, {
        sessionId,
        serverId,
        userId,
        transport,
      });
    } catch (error) {
      this.logHandlerError("socket.register_terminal_session", error);
    }
  }

  /**
   * Broadcasts terminal output to subscribed console clients.
   */
  broadcastTerminalOutput(sessionId: string, data: string): void {
    try {
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
    } catch (error) {
      this.logHandlerError("socket.broadcast_terminal_output", error);
    }
  }

  /**
   * Returns a tracked terminal session by id.
   */
  getTerminalSession(sessionId: string): TerminalSessionRecord | undefined {
    try {
      return this.terminalSessionsById.get(sessionId);
    } catch (error) {
      this.logHandlerError("socket.get_terminal_session", error);
      return undefined;
    }
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
          reject(
            new Error(WEBSOCKET_ERROR_MESSAGES.NO_CONNECTED_AGENT(serverId)),
          );
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
          logSocketTimeout(this.logger, "socket.container_logs_start", {
            serverId,
            requestId,
            sessionId,
            containerId,
          });
          reject(
            new Error(
              WEBSOCKET_ERROR_MESSAGES.TIMEOUT.CONTAINER_LOGS_START(
                timeoutMs / 1000,
                serverId,
              ),
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

        logSocketEmit(this.logger, DeploymentEvents.CONTAINER_LOGS_START, {
          agentSocket: client.id,
          serverId,
          containerId,
          sessionId,
          requestId,
        });

        client.emit(DeploymentEvents.CONTAINER_LOGS_START, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Registers a container logs session in the gateway registry.
   */
  registerContainerLogsSession(
    sessionId: string,
    serverId: string,
    userId: string,
    containerId: string,
  ): void {
    try {
      this.containerLogsSessionsById.set(sessionId, {
        sessionId,
        serverId,
        userId,
        containerId,
      });
    } catch (error) {
      this.logHandlerError("socket.register_container_logs_session", error);
    }
  }

  /**
   * Returns a tracked container logs session by id.
   */
  getContainerLogsSession(
    sessionId: string,
  ): ContainerLogsSessionRecord | undefined {
    try {
      return this.containerLogsSessionsById.get(sessionId);
    } catch (error) {
      this.logHandlerError("socket.get_container_logs_session", error);
      return undefined;
    }
  }

  /**
   * Closes a container logs session and notifies subscribers.
   */
  closeContainerLogsSession(
    sessionId: string,
    options: { notifyAgent?: boolean } = {},
  ): void {
    try {
      const session = this.containerLogsSessionsById.get(sessionId);
      if (!session) {
        return;
      }

      this.containerLogsSessionsById.delete(sessionId);

      if (options.notifyAgent !== false) {
        const agent = this.agentsByServerId.get(session.serverId);
        if (agent?.connected) {
          const payload: ContainerLogsStopPayload = { sessionId };
          logSocketEmit(this.logger, DeploymentEvents.CONTAINER_LOGS_STOP, {
            sessionId,
            serverId: session.serverId,
            target: "agent",
          });
          agent.emit(DeploymentEvents.CONTAINER_LOGS_STOP, payload);
        }
      }

      const ns = this.getNamespaceServer();
      const payload: ContainerLogsStopPayload = { sessionId };
      logSocketEmit(this.logger, DeploymentEvents.CONTAINER_LOGS_STOP, {
        sessionId,
        target: "console",
      });
      ns?.to(containerLogsRoom(sessionId)).emit(
        DeploymentEvents.CONTAINER_LOGS_STOP,
        payload,
      );
    } catch (error) {
      this.logHandlerError("socket.close_container_logs_session", error);
    }
  }

  /**
   * Notifies an agent about a container logs session stop.
   * @param serverId - The server ID.
   * @param sessionId - The session ID.
   */
  notifyAgentContainerLogsStop(serverId: string, sessionId: string): void {
    try {
      const agent = this.agentsByServerId.get(serverId);
      if (!agent?.connected) {
        return;
      }

      const payload: ContainerLogsStopPayload = { sessionId };
      logSocketEmit(this.logger, DeploymentEvents.CONTAINER_LOGS_STOP, {
        sessionId,
        serverId,
        target: "agent",
      });
      agent.emit(DeploymentEvents.CONTAINER_LOGS_STOP, payload);
    } catch (error) {
      this.logHandlerError("socket.notify_container_logs_stop", error);
    }
  }

  /**
   * Closes a terminal session.
   * @param sessionId - The session ID.
   * @param options - The options for closing the terminal session.
   * @returns A promise that resolves when the terminal session is closed.
   */
  closeTerminalSession(
    sessionId: string,
    options: {
      notifyAgent?: boolean;
      skipTransportClose?: boolean;
    } = {},
  ): void {
    try {
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
            logSocketEmit(this.logger, DeploymentEvents.TERMINAL_DISCONNECT, {
              sessionId,
              serverId: session.serverId,
              target: "agent",
            });
            agent.emit(DeploymentEvents.TERMINAL_DISCONNECT, payload);
          }
        }
      }

      const ns = this.getNamespaceServer();
      const payload: TerminalDisconnectPayload = { sessionId };
      logSocketEmit(this.logger, DeploymentEvents.TERMINAL_DISCONNECT, {
        sessionId,
        target: "console",
      });
      ns?.to(terminalRoom(sessionId)).emit(
        DeploymentEvents.TERMINAL_DISCONNECT,
        payload,
      );
    } catch (error) {
      this.logHandlerError("socket.close_terminal_session", error);
    }
  }

  /**
   * Notifies an agent about a terminal session disconnect.
   * @param serverId - The server ID.
   * @param sessionId - The session ID.
   */
  notifyAgentTerminalDisconnect(serverId: string, sessionId: string): void {
    try {
      const agent = this.agentsByServerId.get(serverId);
      if (!agent?.connected) {
        return;
      }

      const payload: TerminalDisconnectPayload = { sessionId };
      logSocketEmit(this.logger, DeploymentEvents.TERMINAL_DISCONNECT, {
        sessionId,
        serverId,
        target: "agent",
      });
      agent.emit(DeploymentEvents.TERMINAL_DISCONNECT, payload);
    } catch (error) {
      this.logHandlerError("socket.notify_terminal_disconnect", error);
    }
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
          reject(
            new Error(WEBSOCKET_ERROR_MESSAGES.NO_CONNECTED_AGENT(serverId)),
          );
          return;
        }

        const requestId = randomUUID();
        const payload: ContainerDiscoverRequestPayload = { requestId };

        const timer = setTimeout(() => {
          this.pendingContainerDiscovery.delete(requestId);
          logSocketTimeout(this.logger, "socket.container_discover", {
            serverId,
            requestId,
          });
          reject(
            new Error(
              WEBSOCKET_ERROR_MESSAGES.TIMEOUT.CONTAINER_DISCOVER(
                timeoutMs / 1000,
                serverId,
              ),
            ),
          );
        }, timeoutMs);

        this.pendingContainerDiscovery.set(requestId, {
          serverId,
          resolve,
          reject,
          timer,
        });

        logSocketEmit(this.logger, DeploymentEvents.CONTAINER_DISCOVER, {
          agentSocket: client.id,
          serverId,
          requestId,
        });

        client.emit(DeploymentEvents.CONTAINER_DISCOVER, payload);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Attaches inbound event handlers to an agent socket connection.
   */
  private attachAgentInboundHandlers(client: Socket): void {
    try {
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
    } catch (error) {
      this.logHandlerError("socket.attach_agent_handlers", error);
    }
  }

  /**
   * Processes an agent terminal disconnect.
   */
  private processAgentTerminalDisconnect(
    client: Socket,
    payload: TerminalDisconnectPayload,
  ): void {
    try {
      const sessionId = payload?.sessionId?.trim();
      if (!sessionId) {
        return;
      }

      const session = this.terminalSessionsById.get(sessionId);
      if (session && !this.isSocketServingServer(client, session.serverId)) {
        return;
      }

      this.closeTerminalSession(sessionId, {
        notifyAgent: false,
        skipTransportClose: true,
      });
    } catch (error) {
      this.logHandlerError("socket.process_agent_terminal_disconnect", error);
    }
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
        return;
      }

      const pending = this.pendingTerminalConnects.get(requestId);
      if (!pending) {
        return;
      }

      if (!this.isSocketServingServer(client, pending.serverId)) {
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
        pending.reject(
          new Error(
            WEBSOCKET_ERROR_MESSAGES.AGENT_RETURNED_NO_TERMINAL_SESSION_ID,
          ),
        );
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
      this.logHandlerError("socket.process_terminal_connect_result", error);
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

      const session = this.terminalSessionsById.get(sessionId);
      if (!session || !this.isSocketServingServer(client, session.serverId)) {
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
      this.logHandlerError("socket.relay_terminal_output", error);
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
      this.logHandlerError("socket.forward_terminal_event", error, { event });
    }
  }

  /**
   * Rejects pending terminal connects for a server.
   */
  private rejectPendingTerminalConnectsForServer(
    serverId: string,
    reason: string,
  ): void {
    try {
      for (const [requestId, pending] of this.pendingTerminalConnects) {
        if (pending.serverId !== serverId) {
          continue;
        }
        clearTimeout(pending.timer);
        this.pendingTerminalConnects.delete(requestId);
        pending.reject(new Error(reason));
      }
    } catch (error) {
      this.logHandlerError("socket.reject_pending_terminal_connects", error);
    }
  }

  /**
   * Closes terminal sessions for a server.
   */
  private closeTerminalSessionsForServer(serverId: string): void {
    try {
      for (const [sessionId, session] of this.terminalSessionsById) {
        if (session.serverId !== serverId) {
          continue;
        }
        this.closeTerminalSession(sessionId, {
          notifyAgent: session.transport === TerminalTransport.AGENT,
        });
      }
    } catch (error) {
      this.logHandlerError("socket.close_terminal_sessions_for_server", error);
    }
  }

  /**
   * Rejects pending container logs starts for a server.
   */
  private rejectPendingContainerLogsStartsForServer(
    serverId: string,
    reason: string,
  ): void {
    try {
      for (const [requestId, pending] of this.pendingContainerLogsStarts) {
        if (pending.serverId !== serverId) {
          continue;
        }
        clearTimeout(pending.timer);
        this.pendingContainerLogsStarts.delete(requestId);
        this.containerLogsSessionsById.delete(pending.sessionId);
        pending.reject(new Error(reason));
      }
    } catch (error) {
      this.logHandlerError(
        "socket.reject_pending_container_logs_starts",
        error,
      );
    }
  }

  /**
   * Closes container logs sessions for a server.
   */
  private closeContainerLogsSessionsForServer(serverId: string): void {
    try {
      for (const [sessionId, session] of this.containerLogsSessionsById) {
        if (session.serverId !== serverId) {
          continue;
        }
        this.closeContainerLogsSession(sessionId, { notifyAgent: false });
      }
    } catch (error) {
      this.logHandlerError(
        "socket.close_container_logs_sessions_for_server",
        error,
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
        return;
      }

      const pending = this.pendingContainerLogsStarts.get(requestId);
      if (!pending) {
        return;
      }

      if (!this.isSocketServingServer(client, pending.serverId)) {
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
          new Error(
            WEBSOCKET_ERROR_MESSAGES.AGENT_RETURNED_NO_CONTAINER_LOGS_SESSION_ID,
          ),
        );
        return;
      }

      pending.resolve(sessionId);
    } catch (error) {
      this.logHandlerError("socket.process_container_logs_start_result", error);
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

      const session = this.containerLogsSessionsById.get(sessionId);
      if (!session || !this.isSocketServingServer(client, session.serverId)) {
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
      this.logHandlerError("socket.relay_container_logs_data", error);
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

      const session = this.containerLogsSessionsById.get(sessionId);
      if (!session || !this.isSocketServingServer(client, session.serverId)) {
        return;
      }

      const ns = this.getNamespaceServer();
      if (!ns) {
        return;
      }

      logSocketEmit(this.logger, DeploymentEvents.CONTAINER_LOGS_ERROR, {
        sessionId,
        target: "console",
        error,
      });
      ns.to(containerLogsRoom(sessionId)).emit(
        DeploymentEvents.CONTAINER_LOGS_ERROR,
        { sessionId, error },
      );

      this.closeContainerLogsSession(sessionId, { notifyAgent: false });
    } catch (error) {
      this.logHandlerError("socket.relay_container_logs_error", error);
    }
  }

  /**
   * Processes a container logs stop request.
   */
  private processAgentContainerLogsStop(
    client: Socket,
    payload: ContainerLogsStopPayload,
  ): void {
    try {
      const sessionId = payload?.sessionId?.trim();
      if (!sessionId) {
        return;
      }

      const session = this.containerLogsSessionsById.get(sessionId);
      if (session && !this.isSocketServingServer(client, session.serverId)) {
        return;
      }

      this.closeContainerLogsSession(sessionId, { notifyAgent: false });
    } catch (error) {
      this.logHandlerError("socket.process_agent_container_logs_stop", error);
    }
  }

  /**
   * Rejects pending container discovery for a server.
   */
  private rejectPendingDiscoveryForServer(
    serverId: string,
    reason: string,
  ): void {
    try {
      for (const [requestId, pending] of this.pendingContainerDiscovery) {
        if (pending.serverId !== serverId) {
          continue;
        }
        clearTimeout(pending.timer);
        this.pendingContainerDiscovery.delete(requestId);
        pending.reject(new Error(reason));
      }
    } catch (error) {
      this.logHandlerError("socket.reject_pending_container_discovery", error);
    }
  }

  /**
   * Rejects pending deployment validations for a server.
   */
  private rejectPendingDeploymentValidatesForServer(
    serverId: string,
    reason: string,
  ): void {
    try {
      for (const [requestId, pending] of this.pendingDeploymentValidations) {
        if (pending.serverId !== serverId) {
          continue;
        }
        clearTimeout(pending.timer);
        this.pendingDeploymentValidations.delete(requestId);
        pending.reject(new Error(reason));
      }
    } catch (error) {
      this.logHandlerError(
        "socket.reject_pending_deployment_validations",
        error,
      );
    }
  }

  /**
   * Rejects pending server resources for a server.
   */
  private rejectPendingResourcesForServer(
    serverId: string,
    reason: string,
  ): void {
    try {
      for (const [requestId, pending] of this.pendingServerResources) {
        if (pending.serverId !== serverId) {
          continue;
        }
        clearTimeout(pending.timer);
        this.pendingServerResources.delete(requestId);
        pending.reject(new Error(reason));
      }
    } catch (error) {
      this.logHandlerError("socket.reject_pending_server_resources", error);
    }
  }

  /**
   * Rejects pending container actions for a server.
   */
  private rejectPendingContainerActionsForServer(
    serverId: string,
    reason: string,
  ): void {
    try {
      for (const [requestId, pending] of this.pendingContainerActions) {
        if (pending.serverId !== serverId) {
          continue;
        }
        clearTimeout(pending.timer);
        this.pendingContainerActions.delete(requestId);
        pending.reject(new Error(reason));
      }
    } catch (error) {
      this.logHandlerError("socket.reject_pending_container_actions", error);
    }
  }

  /**
   * Rejects pending deployment removes for a server.
   */
  private rejectPendingDeploymentRemovesForServer(
    serverId: string,
    reason: string,
  ): void {
    try {
      for (const [deploymentId, pending] of this.pendingDeploymentRemoves) {
        if (pending.serverId !== serverId) {
          continue;
        }
        clearTimeout(pending.timer);
        this.pendingDeploymentRemoves.delete(deploymentId);
        pending.reject(new Error(reason));
      }
    } catch (error) {
      this.logHandlerError("socket.reject_pending_deployment_removes", error);
    }
  }

  /**
   * Rejects pending agent removes for a server.
   */
  private rejectPendingAgentRemovesForServer(
    serverId: string,
    reason: string,
  ): void {
    try {
      for (const [requestId, pending] of this.pendingAgentRemoves) {
        if (pending.serverId !== serverId) {
          continue;
        }
        clearTimeout(pending.timer);
        this.pendingAgentRemoves.delete(requestId);
        pending.reject(new Error(reason));
      }
    } catch (error) {
      this.logHandlerError("socket.reject_pending_agent_removes", error);
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
      this.logHandlerError("socket.check_agent_for_server", error, {
        serverId,
      });
      return false;
    }
  }

  /**
   * Checks if an agent supports a capability.
   */
  agentSupports(serverId: string, capability: string): boolean {
    try {
      const capabilities = this.agentCapabilitiesByServerId.get(serverId);
      return Boolean(capabilities?.has(capability));
    } catch (error) {
      this.logHandlerError("socket.check_agent_capability", error);
      return false;
    }
  }

  /**
   * Gets the version of an agent for a server.
   */
  getAgentVersion(serverId: string): string | null {
    try {
      return this.agentVersionsByServerId.get(serverId) ?? null;
    } catch (error) {
      this.logHandlerError("socket.get_agent_version", error);
      return null;
    }
  }

  /**
   * Processes an agent hello message.
   */
  private processAgentHello(client: Socket, payload: AgentHelloPayload): void {
    try {
      const capabilities = new Set(payload?.capabilities ?? []);
      const version = payload?.version?.trim() || "unknown";

      for (const serverId of this.getBoundServerIds(client.id)) {
        this.agentCapabilitiesByServerId.set(serverId, capabilities);
        this.agentVersionsByServerId.set(serverId, version);
      }
    } catch (error) {
      this.logHandlerError("socket.process_agent_hello", error);
    }
  }

  /**
   * Clears agent metadata for a server.
   */
  private clearAgentMetadataForServer(serverId: string): void {
    try {
      this.agentCapabilitiesByServerId.delete(serverId);
      this.agentVersionsByServerId.delete(serverId);
    } catch (error) {
      this.logHandlerError("socket.clear_agent_metadata", error);
    }
  }

  /**
   * Gets the connected agents.
   */
  getConnectedAgents(): string[] {
    try {
      return Array.from(this.connectedAgents.keys());
    } catch (error) {
      this.logHandlerError("socket.get_connected_agents", error);
      return [];
    }
  }

  /**
   * Gets the number of connected agents.
   */
  getConnectedAgentsCount(): number {
    try {
      return this.connectedAgents.size;
    } catch (error) {
      this.logHandlerError("socket.get_connected_agents_count", error);
      return 0;
    }
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
      this.logHandlerError("socket.get_primary_agent_public_ip", error);
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
      this.logHandlerError("socket.parse_server_id_from_handshake", error);
      return null;
    }
  }

  /**
   * Returns true if this socket owns the server binding (or the server has no agent yet).
   */
  private isSocketServingServer(client: Socket, serverId: string): boolean {
    const owner = this.agentsByServerId.get(serverId);
    return !owner || owner.id === client.id;
  }

  /** Server ids currently served by this agent socket. */
  private getBoundServerIds(socketId: string): string[] {
    const bound = this.serverIdsBySocketId.get(socketId);
    return bound ? [...bound] : [];
  }

  /**
   * Rejects in-flight agent requests and closes sessions for the given servers.
   */
  private clearPendingOpsForBoundServers(serverIds: string[]): void {
    for (const serverId of serverIds) {
      this.clearAgentMetadataForServer(serverId);
      this.rejectPendingDiscoveryForServer(
        serverId,
        WEBSOCKET_ERROR_MESSAGES.AGENT_DISCONNECTED.CONTAINER_DISCOVERY,
      );
      this.rejectPendingResourcesForServer(
        serverId,
        WEBSOCKET_ERROR_MESSAGES.AGENT_DISCONNECTED.SERVER_RESOURCES,
      );
      this.rejectPendingDeploymentValidatesForServer(
        serverId,
        WEBSOCKET_ERROR_MESSAGES.AGENT_DISCONNECTED.DEPLOYMENT_VALIDATION,
      );
      this.rejectPendingContainerActionsForServer(
        serverId,
        WEBSOCKET_ERROR_MESSAGES.AGENT_DISCONNECTED.CONTAINER_ACTION,
      );
      this.rejectPendingDeploymentRemovesForServer(
        serverId,
        WEBSOCKET_ERROR_MESSAGES.AGENT_DISCONNECTED.DEPLOYMENT_REMOVAL,
      );
      this.rejectPendingAgentRemovesForServer(
        serverId,
        WEBSOCKET_ERROR_MESSAGES.AGENT_DISCONNECTED.AGENT_REMOVAL,
      );
      this.rejectPendingTerminalConnectsForServer(
        serverId,
        WEBSOCKET_ERROR_MESSAGES.AGENT_DISCONNECTED.TERMINAL_CONNECT,
      );
      this.rejectPendingContainerLogsStartsForServer(
        serverId,
        WEBSOCKET_ERROR_MESSAGES.AGENT_DISCONNECTED.CONTAINER_LOGS_START,
      );
      this.closeTerminalSessionsForServer(serverId);
      this.closeContainerLogsSessionsForServer(serverId);
    }
  }

  /**
   * Registers one agent socket for all server ids that share the host.
   * Disconnects any previous agent that owned overlapping bindings.
   */
  private registerAgentSocketForServers(
    client: Socket,
    serverIds: string[],
  ): void {
    const socketId = client.id;
    const previousSockets = new Map<string, Socket>();
    const bound = new Set<string>();

    for (const serverId of serverIds) {
      if (!serverId) {
        continue;
      }
      const previous = this.agentsByServerId.get(serverId);
      if (previous && previous.id !== socketId) {
        previousSockets.set(previous.id, previous);
      }
      bound.add(serverId);
    }

    if (bound.size === 0) {
      return;
    }

    for (const previous of previousSockets.values()) {
      this.unregisterServerBinding(previous.id);
      previous.disconnect(true);
    }

    for (const serverId of bound) {
      this.clearAgentMetadataForServer(serverId);
      this.agentsByServerId.set(serverId, client);
    }
    this.serverIdsBySocketId.set(socketId, bound);
    this.serverIdBySocketId.set(socketId, [...bound][0]);
  }

  /**
   * Lets a newly onboarded server use an agent already connected for the same host.
   * No new socket is created — the existing agent is reused.
   */
  attachServerToExistingAgent(
    serverId: string,
    siblingServerId: string,
  ): boolean {
    try {
      if (
        serverId === siblingServerId ||
        this.agentsByServerId.get(serverId)?.connected
      ) {
        return this.isAgentConnectedForServer(serverId);
      }

      const client = this.agentsByServerId.get(siblingServerId);
      if (!client?.connected) {
        return false;
      }

      this.agentsByServerId.set(serverId, client);
      const bound =
        this.serverIdsBySocketId.get(client.id) ?? new Set<string>();
      bound.add(serverId);
      this.serverIdsBySocketId.set(client.id, bound);
      this.serverIdBySocketId.set(
        client.id,
        this.serverIdBySocketId.get(client.id) ?? serverId,
      );

      const caps = this.agentCapabilitiesByServerId.get(siblingServerId);
      if (caps) {
        this.agentCapabilitiesByServerId.set(serverId, new Set(caps));
      }
      const version = this.agentVersionsByServerId.get(siblingServerId);
      if (version) {
        this.agentVersionsByServerId.set(serverId, version);
      }

      this.getNamespaceServer()?.emit(DeploymentEvents.AGENT_CONNECTED, {
        agentId: client.id,
        serverId,
        timestamp: new Date().toISOString(),
        totalAgents: this.connectedAgents.size,
      });
      void this.serverConnectionsService.handleAgentConnected(serverId);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to share agent with server ${serverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Removes all serverId → socket mappings for a disconnected agent.
   */
  private unregisterServerBinding(socketId: string): void {
    try {
      const bound = this.serverIdsBySocketId.get(socketId);
      if (bound) {
        for (const serverId of bound) {
          if (this.agentsByServerId.get(serverId)?.id === socketId) {
            this.agentsByServerId.delete(serverId);
          }
        }
        this.serverIdsBySocketId.delete(socketId);
      }
      this.serverIdBySocketId.delete(socketId);
    } catch (error) {
      this.logHandlerError("socket.unregister_server_binding", error, {
        socketId,
      });
    }
  }
}
