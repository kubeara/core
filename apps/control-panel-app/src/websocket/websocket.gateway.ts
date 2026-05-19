import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { DeploymentsService } from '../deployments/deployments.service';
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

    constructor(
        @Inject(forwardRef(() => DeploymentsService))
        private readonly deploymentsService: DeploymentsService,
    ) {}

    @WebSocketServer()
    server!: Server;

    private connectedAgents = new Map<string, Socket>();
    private agentPublicIps = new Map<string, string>();

    afterInit(): void {
        this.logger.log('WebSocket Gateway initialized');
    }

    handleConnection(client: Socket): void {
        const agentId = client.id;
        const headerIp = client.handshake.headers['x-agent-public-ip'];
        const queryIp = client.handshake.query.publicIp;
        const publicIp = String(
            (Array.isArray(headerIp) ? headerIp[0] : headerIp) ??
                (Array.isArray(queryIp) ? queryIp[0] : queryIp) ??
                '',
        ).trim();

        this.connectedAgents.set(agentId, client);
        if (publicIp) {
            this.agentPublicIps.set(agentId, publicIp);
        }

        this.logger.log(
            `Agent connected: ${agentId} (Total: ${this.connectedAgents.size})` +
                (publicIp ? ` publicIp=${publicIp}` : ' (no public IP — set AGENT_PUBLIC_IP)'),
        );

        this.server.emit(DeploymentEvents.AGENT_CONNECTED, {
            agentId,
            timestamp: new Date().toISOString(),
            totalAgents: this.connectedAgents.size,
        });
    }

    handleDisconnect(client: Socket): void {
        const agentId = client.id;
        this.connectedAgents.delete(agentId);
        this.agentPublicIps.delete(agentId);

        this.logger.log(`Agent disconnected: ${agentId} (Total: ${this.connectedAgents.size})`);

        this.server.emit(DeploymentEvents.AGENT_DISCONNECTED, {
            agentId,
            timestamp: new Date().toISOString(),
            totalAgents: this.connectedAgents.size,
        });
    }

    @SubscribeMessage(DeploymentEvents.DEPLOYMENT_STATUS)
    async handleDeploymentStatus(client: Socket, payload: DeploymentStatusPayload): Promise<void> {
        this.logger.debug(`Status from ${client.id}: ${payload.status}`);

        if (payload.deploymentId) {
            try {
                await this.deploymentsService.updateStatus(payload.deploymentId, payload.status, {
                    message: payload.message,
                    error: payload.error,
                });
            } catch (err) {
                this.logger.warn(
                    `Could not persist deployment status for ${payload.deploymentId}: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }

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

    /** Public IP reported by the first connected agent (for sslip.io URL generation). */
    getPrimaryAgentPublicIp(): string | null {
        const first = this.agentPublicIps.values().next();
        const ip = first.value?.trim();

        return ip || null;
    }
}