import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { io, Socket } from 'socket.io-client';
import {
    DeploymentStatusPayload,
    SocketDeployMessage,
    DeploymentLogPayload,
    DeploymentEvents,
} from '@shared/socket-events';
import { DeployTemplateExecutor } from '../executors/deploy-template.executor';
import { EncryptionService, TemplatePayloadService, SUCCESS_MESSAGES } from '@shared/common';
import type { EnvFileInput, PortFileInput } from '../executors/env-file.util';
const yaml = require('js-yaml');

@Injectable()
export class SocketClientService {
    private readonly logger = new Logger(SocketClientService.name);
    private socket: Socket | null = null;
    private connected = false;
    private readonly agentId: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly executor: DeployTemplateExecutor,
        private readonly encryptionService: EncryptionService,
        private readonly templatePayloadService: TemplatePayloadService,
    ) {
        this.agentId = this.generateAgentId();
    }

    connect(): void {
        if (this.connected || this.socket) {
            this.logger.warn('Socket already connected or connecting');
            return;
        }

        const controlPanelUrl = this.configService.get<string>('CONTROL_PANEL_URL', 'http://localhost:3000');
        const publicIp = this.configService.get<string>('AGENT_PUBLIC_IP', '').trim();

        this.logger.log(`Connecting to control panel at ${controlPanelUrl}`);

        this.socket = io(`${controlPanelUrl}/deployments`, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity,
            extraHeaders: {
                'X-Agent-ID': this.agentId,
                ...(publicIp ? { 'X-Agent-Public-IP': publicIp } : {}),
            },
            query: publicIp ? { publicIp } : undefined,
        });

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            this.connected = true;
            this.logger.log(`Connected with socket ID: ${this.socket?.id}`);
        });

        this.socket.on('disconnect', (reason) => {
            this.connected = false;
            this.logger.log(`Disconnected: ${reason}`);
        });

        this.socket.on('connect_error', (error) => {
            this.logger.error(`Connection error: ${error.message}`);
        });

        this.socket.on(DeploymentEvents.DEPLOY, (message: SocketDeployMessage) => {
            void this.handleDeployAction(message);
        });

        this.socket.on(DeploymentEvents.AGENT_CONNECTED, (data) => {
            this.logger.debug(`Agent connected notification: ${JSON.stringify(data)}`);
        });

        this.socket.on(DeploymentEvents.AGENT_DISCONNECTED, (data) => {
            this.logger.debug(`Agent disconnected notification: ${JSON.stringify(data)}`);
        });
    }

    private async handleDeployAction(message: SocketDeployMessage): Promise<void> {
        const {
            name,
            compose,
            env,
            deploymentId: providedId,
            ports: encryptedPorts,
            schema,
            composeOnly,
        } = message.payload;
        const deploymentId = providedId || this.generateDeploymentId();

        this.sendDeploymentStatus({
            deploymentId,
            templateSlug: name,
            status: 'pending',
            message: SUCCESS_MESSAGES.PREPARING,
        });

        try {
            // 1. Decrypt and decode compose
            const decryptedEncodedCompose = this.encryptionService.decrypt(compose);
            const composeObj = this.templatePayloadService.decodeBase64ToObject(decryptedEncodedCompose);
            const composeYaml = yaml.dump(composeObj, { lineWidth: -1, noRefs: true });

            // 2. Decrypt env and ports
            const envValues = env ? this.decryptAndParse(env) : {};
            const portValues = encryptedPorts ? this.decryptAndParse(encryptedPorts) : {};

            // 3. Schema required for legacy deploy path only
            if (!composeOnly && !schema) {
                throw new Error(`Missing deployment schema for template ${name}`);
            }

            // 4. Execute deployment
            this.logger.log(`Starting deployment ${deploymentId} for template ${name}`);
            await this.executor.execute({
                name,
                compose: composeYaml,
                env: { env: envValues, ports: portValues },
                deploymentId,
                schema,
                composeOnly,
                notifier: this,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Deployment initialization failed: ${msg}`);

            this.sendDeploymentStatus({
                deploymentId,
                templateSlug: name,
                status: 'failed',
                message: msg,
                error: msg,
            });
        }
    }

    private decryptAndParse(encryptedData: string): Record<string, any> {
        try {
            const decrypted = this.encryptionService.decrypt(encryptedData);
            return JSON.parse(decrypted || '{}');
        } catch (err) {
            this.logger.error(`Failed to decrypt/parse data: ${err instanceof Error ? err.message : String(err)}`);
            return {};
        }
    }

    private sendDeploymentStatus(payload: DeploymentStatusPayload): void {
        if (!this.socket?.connected) return;

        this.socket.emit(DeploymentEvents.DEPLOYMENT_STATUS, {
            ...payload,
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
        });
    }

    private sendDeploymentLog(payload: DeploymentLogPayload): void {
        if (!this.socket?.connected) return;

        this.socket.emit(DeploymentEvents.DEPLOYMENT_LOG, {
            ...payload,
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
        });
    }

    // ExecutionNotifier interface implementation
    sendStatus(payload: DeploymentStatusPayload): void {
        this.sendDeploymentStatus(payload);
    }

    sendLog(payload: DeploymentLogPayload): void {
        this.sendDeploymentLog(payload);
    }

    private generateAgentId(): string {
        const hostname = require('os').hostname();
        const timestamp = Date.now().toString(36);
        return `agent-${hostname}-${timestamp}`;
    }

    private generateDeploymentId(): string {
        return `deployment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    getAgentId(): string {
        return this.agentId;
    }
}
