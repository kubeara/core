import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import {
    DeploymentStatusPayload,
    DeploymentLogPayload,
    DeploymentEvents,
    SocketDeployMessage,
} from '@shared/socket-events';

@Injectable()
@WebSocketGateway({
    namespace: 'deployments',
    cors: { origin: '*' },
})
export class DeploymentGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(DeploymentGateway.name);

    @WebSocketServer()
    server!: Server;

    private connectedAgents = new Map<string, Socket>();

    afterInit(): void {
        this.logger.log('WebSocket Gateway initialized');
    }

    handleConnection(client: Socket): void {
        const agentId = client.id;
        this.connectedAgents.set(agentId, client);

        this.logger.log(`Agent connected: ${agentId} (Total: ${this.connectedAgents.size})`);

        this.server.emit(DeploymentEvents.AGENT_CONNECTED, {
            agentId,
            timestamp: new Date().toISOString(),
            totalAgents: this.connectedAgents.size,
        });
    }

    handleDisconnect(client: Socket): void {
        const agentId = client.id;
        this.connectedAgents.delete(agentId);

        this.logger.log(`Agent disconnected: ${agentId} (Total: ${this.connectedAgents.size})`);

        this.server.emit(DeploymentEvents.AGENT_DISCONNECTED, {
            agentId,
            timestamp: new Date().toISOString(),
            totalAgents: this.connectedAgents.size,
        });
    }

    @SubscribeMessage(DeploymentEvents.DEPLOYMENT_STATUS)
    handleDeploymentStatus(client: Socket, payload: DeploymentStatusPayload): void {
        this.logger.debug(`Status from ${client.id}: ${payload.status}`);
        this.server.emit(DeploymentEvents.DEPLOYMENT_STATUS, {
            agentId: client.id,
            ...payload,
            receivedAt: new Date().toISOString(),
        });
    }

    @SubscribeMessage(DeploymentEvents.DEPLOYMENT_LOG)
    handleDeploymentLog(client: Socket, payload: DeploymentLogPayload): void {
        this.server.emit(DeploymentEvents.DEPLOYMENT_LOG, {
            agentId: client.id,
            ...payload,
            receivedAt: new Date().toISOString(),
        });
    }

    /**
     * Emit a deploy message to all connected agents.
     */
    emitDeploy(message: SocketDeployMessage): void {
        this.logger.log(`Emitting deploy message for template: ${message.payload.name}`);
        this.server.emit(DeploymentEvents.DEPLOY, message);
    }

    getConnectedAgents(): string[] {
        return Array.from(this.connectedAgents.keys());
    }

    getConnectedAgentsCount(): number {
        return this.connectedAgents.size;
    }
}