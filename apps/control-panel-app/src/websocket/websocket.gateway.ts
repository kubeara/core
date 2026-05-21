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
import { DeploymentsService } from "../modules/deployments/deployments.service";
import {
  DeploymentStatusPayload,
  DeploymentLogPayload,
  DeploymentEvents,
  SocketDeployMessage,
  SocketRemoveMessage,
} from "@shared/socket-events";

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
  ) {}

  @WebSocketServer()
  server!: Server;

  private connectedAgents = new Map<string, Socket>();
  private agentPublicIps = new Map<string, string>();

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
  handleConnection(client: Socket): void {
    try {
      const agentId = client.id;
      const headerIp = client.handshake.headers["x-agent-public-ip"];
      const queryIp = client.handshake.query.publicIp;
      const publicIp = String(
        (Array.isArray(headerIp) ? headerIp[0] : headerIp) ??
          (Array.isArray(queryIp) ? queryIp[0] : queryIp) ??
          "",
      ).trim();

      this.connectedAgents.set(agentId, client);
      if (publicIp) {
        this.agentPublicIps.set(agentId, publicIp);
      }

      this.logger.log(
        `Agent connected: ${agentId} (Total: ${this.connectedAgents.size})` +
          (publicIp
            ? ` publicIp=${publicIp}`
            : " (no public IP — set AGENT_PUBLIC_IP)"),
      );

      this.server.emit(DeploymentEvents.AGENT_CONNECTED, {
        agentId,
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
            ...payload,
            receivedAt: new Date().toISOString(),
          });
        } catch (error) {
          this.logger.warn(
            `Could not persist deployment status for ${payload.deploymentId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.server.emit(DeploymentEvents.DEPLOYMENT_STATUS, {
        agentId: client.id,
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
   * Emit a remove message to all connected agents.
   */
  emitRemove(message: SocketRemoveMessage): void {
    try {
      this.logger.log(
        `Emitting remove message for deployment: ${message.payload.deploymentId}`,
      );
      this.server.emit(DeploymentEvents.REMOVE, message);
    } catch (error) {
      this.logger.error(
        `Failed to emit remove message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  emitDeploy(message: SocketDeployMessage): void {
    try {
      this.logger.log(
        `Emitting deploy message for template: ${message.payload.name}`,
      );
      this.server.emit(DeploymentEvents.DEPLOY, message);
    } catch (error) {
      this.logger.error(
        `Failed to emit deploy message: ${error instanceof Error ? error.message : String(error)}`,
      );
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

  /** Public IP reported by the first connected agent (for sslip.io URL generation). */
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
}
