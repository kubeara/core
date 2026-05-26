import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
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
  SocketDeployMessage,
  SocketRemoveMessage,
} from "@shared/socket-events";
import { DeploymentsService } from "@control-panel/modules/deployments/deployments.service";
import { AgentServerBindingService } from "@control-panel/modules/server-connections/services/agent-server-binding.service";

const SERVER_ID_HEADER = "x-kubeara-server-id";

@Injectable()
@WebSocketGateway({
  namespace: "deployments",
  cors: { origin: "*" },
})
export class DeploymentGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DeploymentGateway.name);

  /**
   * Creates deployment websocket gateway with deployment status persistence service.
   * @param deploymentsService Service used to persist deployment status updates.
   */
  constructor(
    @Inject(forwardRef(() => DeploymentsService))
    private readonly deploymentsService: DeploymentsService,
    private readonly agentServerBinding: AgentServerBindingService,
  ) {}

  @WebSocketServer()
  server!: Server;

  private connectedAgents = new Map<string, Socket>();
  private agentPublicIps = new Map<string, string>();
  /** Maps Kubeara `servers.id` → active agent socket. */
  private agentsByServerId = new Map<string, Socket>();
  private serverIdBySocketId = new Map<string, string>();

  /**
   * Logs gateway initialization event.
   * @returns Void.
   */
  afterInit(): void {
    try {
      this.logger.log("WebSocket Gateway initialized");
    } catch (error) {
      this.logger.error(
        `Failed during websocket gateway initialization logging: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Handles agent websocket connection and tracks optional reported public IP.
   * @param client Connected socket client.
   * @returns Void.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const agentId = client.id;
      const publicIp = this.extractPublicIpFromHandshake(client);
      const explicitServerId = this.extractServerIdFromHandshake(client);

      const serverId = await this.agentServerBinding.resolveServerIdForAgent({
        explicitServerId,
        reportedPublicIp: publicIp || null,
      });

      this.connectedAgents.set(agentId, client);
      if (publicIp) {
        this.agentPublicIps.set(agentId, publicIp);
      }

      if (serverId) {
        const previous = this.agentsByServerId.get(serverId);
        if (previous && previous.id !== agentId) {
          this.logger.warn(
            `Replacing prior agent socket for serverId=${serverId} (old=${previous.id}, new=${agentId})`,
          );
          this.unregisterServerBinding(previous.id);
          previous.disconnect(true);
        }

        this.agentsByServerId.set(serverId, client);
        this.serverIdBySocketId.set(agentId, serverId);
      }

      this.logger.log(
        `Agent connected: ${agentId} (Total: ${this.connectedAgents.size})` +
          (serverId
            ? ` serverId=${serverId} (auto-bound)`
            : " (unbound — deploy to this host will fail until matched)") +
          (publicIp ? ` publicIp=${publicIp}` : ""),
      );

      this.server.emit(DeploymentEvents.AGENT_CONNECTED, {
        agentId,
        serverId: serverId ?? undefined,
        timestamp: new Date().toISOString(),
        totalAgents: this.connectedAgents.size,
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle agent connection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Handles agent websocket disconnection and removes tracked state.
   * @param client Disconnected socket client.
   * @returns Void.
   */
  handleDisconnect(client: Socket): void {
    try {
      const agentId = client.id;
      this.connectedAgents.delete(agentId);
      this.agentPublicIps.delete(agentId);
      this.unregisterServerBinding(agentId);

      this.logger.log(
        `Agent disconnected: ${agentId} (Total: ${this.connectedAgents.size})`,
      );

      this.server.emit(DeploymentEvents.AGENT_DISCONNECTED, {
        agentId,
        timestamp: new Date().toISOString(),
        totalAgents: this.connectedAgents.size,
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle agent disconnect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @SubscribeMessage(DeploymentEvents.DEPLOYMENT_STATUS)
  async handleDeploymentStatus(
    client: Socket,
    payload: DeploymentStatusPayload,
  ): Promise<void> {
    try {
      this.logger.debug(`Status from ${client.id}: ${payload.status}`);

      if (payload.deploymentId) {
        try {
          if (payload.status === "removed") {
            await this.deploymentsService.softDeleteDeploymentRecord(
              payload.deploymentId,
              {
                message: payload.message,
              },
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
      }

      this.server.emit(DeploymentEvents.DEPLOYMENT_STATUS, {
        agentId: client.id,
        serverId: this.serverIdBySocketId.get(client.id),
        ...payload,
        receivedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to process deployment status event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @SubscribeMessage(DeploymentEvents.DEPLOYMENT_LOG)
  handleDeploymentLog(client: Socket, payload: DeploymentLogPayload): void {
    try {
      this.server.emit(DeploymentEvents.DEPLOYMENT_LOG, {
        agentId: client.id,
        serverId: this.serverIdBySocketId.get(client.id),
        ...payload,
        receivedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to process deployment log event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Emit a remove message to the agent bound to `serverId`.
   */
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
   * Emit a deploy message to the agent bound to `serverId`.
   */
  emitDeploy(message: SocketDeployMessage, serverId: string): void {
    try {
      const client = this.agentsByServerId.get(serverId);
      if (!client) {
        throw new Error(
          `No connected agent for server '${serverId}' (template ${message.payload.name})`,
        );
      }

      this.logger.log(
        `Emitting deploy to serverId=${serverId} for template: ${message.payload.name}`,
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
   * Returns true when an agent registered for the given server is connected.
   */
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

  /**
   * Returns currently connected agent IDs.
   * @returns Array of active agent socket identifiers.
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
   * Returns current number of connected agents.
   * @returns Connected agent count.
   */
  getConnectedAgentsCount(): number {
    try {
      return this.connectedAgents.size;
    } catch (error) {
      this.logger.error(
        `Failed to get connected agent count: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Public IP reported by the first connected agent (legacy fallback).
   * Prefer {@link DeploymentsService.buildServerUrlContext} with an explicit serverId.
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
   * Optional id from install-generated agent env (not required from users).
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
