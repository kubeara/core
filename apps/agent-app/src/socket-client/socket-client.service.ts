import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { io, Socket } from "socket.io-client";
import {
  DeploymentStatusPayload,
  SocketDeployMessage,
  SocketRemoveMessage,
  DeploymentLogPayload,
  DeploymentEvents,
} from "@shared/socket-events";
import { DeployTemplateExecutor } from "../executors/deploy-template.executor";
import type { EnvFileInput, PortFileInput } from "../executors/env-file.util";
import {
  EncryptionService,
  TemplatePayloadService,
  SUCCESS_MESSAGES,
} from "@shared/common";
import * as yaml from "js-yaml";
import * as os from "os";

import {
  detectOutboundPublicIp,
  localLoopbackHost,
} from "./agent-public-ip.util";

@Injectable()
export class SocketClientService {
  private readonly logger = new Logger(SocketClientService.name);
  private socket: Socket | null = null;
  private connected = false;
  private readonly agentId: string;
  private readonly inFlightDeployments = new Set<string>();
  private readonly pendingLogs: DeploymentLogPayload[] = [];
  private readonly pendingStatuses: DeploymentStatusPayload[] = [];
  private static readonly MAX_PENDING_LOGS = 5000;

  constructor(
    private readonly configService: ConfigService,
    private readonly executor: DeployTemplateExecutor,
    private readonly encryptionService: EncryptionService,
    private readonly templatePayloadService: TemplatePayloadService,
  ) {
    this.agentId = this.generateAgentId();
  }

  /**
   * Establishes websocket connection to control-panel deployment namespace.
   * @returns Void; logs connection lifecycle events.
   */
  connect(): void {
    void this.connectAsync();
  }

  /**
   * Connects to the control panel and registers this host (no manual server UUID in `.env`).
   */
  private async connectAsync(): Promise<void> {
    try {
      if (this.connected || this.socket) {
        this.logger.warn("Socket already connected or connecting");
        return;
      }

      const controlPanelUrl =
        this.configService.get<string>("CONTROL_PANEL_URL");

      let publicIp = this.configService.get<string>("AGENT_PUBLIC_IP")?.trim();
      if (!publicIp) {
        publicIp = await detectOutboundPublicIp();
        if (publicIp) {
          this.logger.log(`Detected outbound public IP: ${publicIp}`);
        } else {
          publicIp = localLoopbackHost();
          this.logger.log(
            `Using ${publicIp} for registration (local / no outbound detect)`,
          );
        }
      }

      const installServerId = this.configService
        .get<string>("KUBEARA_SERVER_ID")
        ?.trim();

      this.logger.log(`Connecting to control panel at ${controlPanelUrl}`);

      this.socket = io(`${controlPanelUrl}/deployments`, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        extraHeaders: {
          "X-Agent-ID": this.agentId,
          ...(installServerId
            ? { "X-Kubeara-Server-Id": installServerId }
            : {}),
          "X-Agent-Public-IP": publicIp,
        },
        query: {
          ...(installServerId ? { serverId: installServerId } : {}),
          publicIp,
        },
      });

      this.setupEventListeners();
    } catch (error) {
      this.logger.error(
        `Failed to initialize websocket connection: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Registers socket event handlers for connection and deployment lifecycle.
   * @returns Void.
   */
  private setupEventListeners(): void {
    try {
      if (!this.socket) return;

      this.socket.on("connect", () => {
        this.connected = true;
        this.logger.log(`Connected with socket ID: ${this.socket?.id}`);
        this.flushPendingStatuses();
        this.flushPendingLogs();
      });

      this.socket.on("disconnect", (reason) => {
        this.connected = false;
        this.logger.log(`Disconnected: ${reason}`);
      });

      this.socket.on("connect_error", (error) => {
        this.logger.error(`Connection error: ${error.message}`);
      });

      this.socket.on(
        DeploymentEvents.DEPLOY,
        (message: SocketDeployMessage) => {
          void this.handleDeployAction(message);
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to setup socket event listeners: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleDeployAction(
    message: SocketDeployMessage,
  ): Promise<void> {
    const {
      name,
      compose,
      env,
      deploymentId: providedId,
      ports: encryptedPorts,
      schema,
      composeOnly,
      useTraefik,
    } = message.payload;
    const deploymentId = providedId || this.generateDeploymentId();

    this.logger.log(
      `[DEPLOY_TRACE] deploy received deploymentId=${deploymentId} template=${name}`,
    );

    if (this.inFlightDeployments.has(deploymentId)) {
      this.logger.warn(
        `Ignoring duplicate DEPLOY socket message for ${deploymentId}`,
      );
      return;
    }

    this.inFlightDeployments.add(deploymentId);

    this.sendLog({
      deployment: name,
      deploymentId,
      type: "stdout",
      message: "Agent received deployment command. Starting execution…",
      timestamp: new Date().toISOString(),
      source: "deployment",
    });

    this.sendDeploymentStatus({
      deploymentId,
      templateSlug: name,
      status: "pending",
      message: SUCCESS_MESSAGES.PREPARING,
    });

    try {
      // 1. Decrypt and decode compose
      const decryptedEncodedCompose = this.encryptionService.decrypt(compose);
      const composeObj = this.templatePayloadService.decodeBase64ToObject(
        decryptedEncodedCompose,
      );
      const composeYaml = yaml.dump(composeObj, {
        lineWidth: -1,
        noRefs: true,
      });

      // 2. Decrypt env and ports
      const envValues: EnvFileInput = env
        ? (this.decryptAndParse(env) as EnvFileInput)
        : {};
      const portValues: PortFileInput = encryptedPorts
        ? (this.decryptAndParse(encryptedPorts) as PortFileInput)
        : {};

      // 3. Schema required for legacy deploy path only
      if (!composeOnly && !schema) {
        throw new Error(`Missing deployment schema for template ${name}`);
      }

      this.logger.log(
        `[DEPLOY_TRACE] starting deployment execution deploymentId=${deploymentId}`,
      );
      await this.executor.execute({
        name,
        compose: composeYaml,
        env: { env: envValues, ports: portValues },
        deploymentId,
        schema,
        composeOnly,
        useTraefik,
        notifier: this,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Deployment initialization failed: ${msg}`);

      this.sendLog({
        deployment: name,
        deploymentId,
        type: "stderr",
        message: `Deployment failed: ${msg}`,
        timestamp: new Date().toISOString(),
        source: "deployment",
      });

      this.sendDeploymentStatus({
        deploymentId,
        templateSlug: name,
        status: "failed",
        message: msg,
        error: msg,
      });
    } finally {
      this.inFlightDeployments.delete(deploymentId);
    }
  }

  /**
   * Handles remove requests from control panel and tears down deployment resources.
   */
  private async handleRemoveAction(
    message: SocketRemoveMessage,
  ): Promise<void> {
    const { deploymentId, templateSlug } = message.payload;

    try {
      this.logger.log(`Starting removal for deployment ${deploymentId}`);
      await this.executor.removeDeployment({
        deploymentId,
        templateSlug,
        notifier: this,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Deployment removal failed: ${msg}`);

      this.sendDeploymentStatus({
        deploymentId,
        templateSlug,
        status: "failed",
        message: msg,
        error: msg,
      });
    }
  }

  private decryptAndParse(encryptedData: string): Record<string, unknown> {
    try {
      const decrypted = this.encryptionService.decrypt(encryptedData);
      const parsed: unknown = JSON.parse(decrypted || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      this.logger.error(
        `Failed to decrypt/parse data: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {};
    }
  }

  /**
   * Emits deployment status payload to control panel when socket is connected.
   * @param payload Deployment status details.
   */
  private sendDeploymentStatus(payload: DeploymentStatusPayload): void {
    try {
      if (!this.socket?.connected) {
        this.queuePendingStatus(payload);
        return;
      }

      this.emitDeploymentStatus(payload);
    } catch (error) {
      this.logger.error(
        `Failed to send deployment status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private emitDeploymentStatus(payload: DeploymentStatusPayload): void {
    this.socket?.emit(DeploymentEvents.DEPLOYMENT_STATUS, {
      ...payload,
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
    });
  }

  private queuePendingStatus(payload: DeploymentStatusPayload): void {
    this.pendingStatuses.push(payload);
    if (this.pendingStatuses.length > SocketClientService.MAX_PENDING_LOGS) {
      this.pendingStatuses.shift();
    }
  }

  private flushPendingStatuses(): void {
    if (!this.socket?.connected || this.pendingStatuses.length === 0) {
      return;
    }

    const queued = [...this.pendingStatuses];
    this.pendingStatuses.length = 0;

    for (const payload of queued) {
      this.emitDeploymentStatus(payload);
    }
  }

  /**
   * Emits deployment log payload to control panel when socket is connected.
   * @param payload Deployment log details.
   */
  private sendDeploymentLog(payload: DeploymentLogPayload): void {
    try {
      if (!this.socket?.connected) {
        this.queuePendingLog(payload);
        return;
      }

      this.emitDeploymentLog(payload);
    } catch (error) {
      this.logger.error(
        `Failed to send deployment log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private queuePendingLog(payload: DeploymentLogPayload): void {
    this.logger.warn(
      `[DEPLOY_TRACE] log queued (socket disconnected) deploymentId=${payload.deploymentId ?? "n/a"} bytes=${payload.message?.length ?? 0}`,
    );
    this.pendingLogs.push(payload);
    if (this.pendingLogs.length > SocketClientService.MAX_PENDING_LOGS) {
      this.pendingLogs.shift();
    }
    this.logger.debug(
      `Queued deployment log (socket disconnected): deployment=${payload.deployment} deploymentId=${payload.deploymentId ?? "n/a"}`,
    );
  }

  private flushPendingLogs(): void {
    if (!this.socket?.connected || this.pendingLogs.length === 0) {
      return;
    }

    const queued = [...this.pendingLogs];
    this.pendingLogs.length = 0;

    for (const payload of queued) {
      this.emitDeploymentLog(payload);
    }
  }

  private emitDeploymentLog(payload: DeploymentLogPayload): void {
    if (!payload.deploymentId) {
      this.logger.warn(
        `[stream] sendLog skipped: missing deploymentId (deployment=${payload.deployment})`,
      );
      return;
    }

    const source = payload.source === "container" ? "container" : "deployment";

    const outbound: DeploymentLogPayload & { agentId: string } = {
      ...payload,
      deploymentId: payload.deploymentId,
      source,
      agentId: this.agentId,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    };

    this.logger.debug(
      `[stream] log → control panel deploymentId=${outbound.deploymentId} source=${source} bytes=${outbound.message.length}`,
    );
    this.socket?.emit(DeploymentEvents.DEPLOYMENT_LOG, outbound);
  }

  // ExecutionNotifier interface implementation
  /**
   * Sends execution status updates through socket notifier channel.
   * @param payload Deployment execution status payload.
   */
  sendStatus(payload: DeploymentStatusPayload): void {
    try {
      this.sendDeploymentStatus(payload);
    } catch (error) {
      this.logger.error(
        `Failed to forward status payload: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Sends execution logs through socket notifier channel.
   * @param payload Deployment execution log payload.
   */
  sendLog(payload: DeploymentLogPayload): void {
    try {
      this.sendDeploymentLog(payload);
    } catch (error) {
      this.logger.error(
        `Failed to forward log payload: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generates an agent identifier using host and timestamp entropy.
   * @returns Agent ID string.
   */
  private generateAgentId(): string {
    try {
      const hostname = os.hostname();
      const timestamp = Date.now().toString(36);
      return `agent-${hostname}-${timestamp}`;
    } catch (error) {
      throw new Error(
        `Failed to generate agent id: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generates fallback deployment identifier when control panel does not provide one.
   * @returns Deployment ID string.
   */
  private generateDeploymentId(): string {
    try {
      return `deployment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    } catch (error) {
      throw new Error(
        `Failed to generate deployment id: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Closes active websocket connection and resets connection state.
   * @returns Void.
   */
  disconnect(): void {
    try {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
        this.connected = false;
      }
    } catch (error) {
      this.logger.error(
        `Failed to disconnect socket: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns current websocket connection state.
   * @returns True when socket is connected.
   */
  isConnected(): boolean {
    try {
      return this.connected;
    } catch (error) {
      this.logger.error(
        `Failed to read socket connection state: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Returns this agent identifier used in socket communication.
   * @returns Agent ID string.
   */
  getAgentId(): string {
    try {
      return this.agentId;
    } catch (error) {
      throw new Error(
        `Failed to read agent id: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
