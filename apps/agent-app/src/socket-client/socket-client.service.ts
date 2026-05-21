import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { io, Socket } from "socket.io-client";
import {
  DeploymentStatusPayload,
  SocketDeployMessage,
  DeploymentLogPayload,
  DeploymentEvents,
} from "@shared/socket-events";
import { DeployTemplateExecutor } from "../executors/deploy-template.executor";
import {
  EncryptionService,
  TemplatePayloadService,
  SUCCESS_MESSAGES,
} from "@shared/common";
import * as yaml from "js-yaml";
import * as os from "os";

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

  /**
   * Establishes websocket connection to control-panel deployment namespace.
   * @returns Void; logs connection lifecycle events.
   */
  connect(): void {
    try {
      if (this.connected || this.socket) {
        this.logger.warn("Socket already connected or connecting");
        return;
      }

      const controlPanelUrl = this.configService.get<string>(
        "CONTROL_PANEL_URL",
        "http://localhost:3000",
      );
      const publicIp = this.configService
        .get<string>("AGENT_PUBLIC_IP", "")
        .trim();

      this.logger.log(`Connecting to control panel at ${controlPanelUrl}`);

      this.socket = io(`${controlPanelUrl}/deployments`, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        extraHeaders: {
          "X-Agent-ID": this.agentId,
          ...(publicIp ? { "X-Agent-Public-IP": publicIp } : {}),
        },
        query: publicIp ? { publicIp } : undefined,
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

      this.socket.on(DeploymentEvents.AGENT_CONNECTED, (data) => {
        this.logger.debug(
          `Agent connected notification: ${JSON.stringify(data)}`,
        );
      });

      this.socket.on(DeploymentEvents.AGENT_DISCONNECTED, (data) => {
        this.logger.debug(
          `Agent disconnected notification: ${JSON.stringify(data)}`,
        );
      });
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

    this.sendDeploymentStatus({
      deploymentId,
      templateSlug: name,
      status: "pending",
      message: SUCCESS_MESSAGES.PREPARING,
    });

    try {
      const decryptedEncodedCompose = this.encryptionService.decrypt(compose);
      const composeObj = this.templatePayloadService.decodeBase64ToObject(
        decryptedEncodedCompose,
      );
      const composeYaml = yaml.dump(composeObj, {
        lineWidth: -1,
        noRefs: true,
      });

      const rawEnv = env ? this.decryptAndParse(env) : {};
      const rawPorts = encryptedPorts
        ? this.decryptAndParse(encryptedPorts)
        : {};

      // Narrow runtime values to the expected typed shapes used by the executor
      const envValues: import("../executors/env-file.util").EnvFileInput = {};
      for (const [k, v] of Object.entries(rawEnv)) {
        if (v === undefined || v === null) {
          envValues[k] = v;
          continue;
        }
        if (
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean"
        ) {
          envValues[k] = v;
          continue;
        }
        // Fallback: safely serialize non-primitive values
        if (
          typeof v === "object" ||
          typeof v === "function" ||
          typeof v === "symbol"
        ) {
          envValues[k] = JSON.stringify(v);
        } else if (
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean" ||
          typeof v === "bigint"
        ) {
          envValues[k] = String(v);
        } else {
          envValues[k] = JSON.stringify(v);
        }
      }

      const portValues: import("../executors/env-file.util").PortFileInput = {};
      for (const [k, v] of Object.entries(rawPorts)) {
        if (v === undefined || v === null) {
          portValues[k] = v;
          continue;
        }
        if (typeof v === "number" && Number.isFinite(v)) {
          portValues[k] = v;
          continue;
        }
        const parsed = Number(v);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
          portValues[k] = parsed;
          continue;
        }
        // ignore invalid port values (executor will validate later)
      }

      // 3. Schema required for legacy deploy path only
      if (!composeOnly && !schema) {
        throw new Error(`Missing deployment schema for template ${name}`);
      }

      this.logger.log(
        `Starting deployment ${deploymentId} for template ${name}`,
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

      this.sendDeploymentStatus({
        deploymentId,
        templateSlug: name,
        status: "failed",
        message: msg,
        error: msg,
      });
    }
  }

  private decryptAndParse(encryptedData: string): Record<string, unknown> {
    try {
      const decrypted = this.encryptionService.decrypt(encryptedData);
      return JSON.parse(decrypted || "{}") as Record<string, unknown>;
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
      if (!this.socket?.connected) return;

      this.socket.emit(DeploymentEvents.DEPLOYMENT_STATUS, {
        ...payload,
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send deployment status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Emits deployment log payload to control panel when socket is connected.
   * @param payload Deployment log details.
   */
  private sendDeploymentLog(payload: DeploymentLogPayload): void {
    try {
      if (!this.socket?.connected) return;

      this.socket.emit(DeploymentEvents.DEPLOYMENT_LOG, {
        ...payload,
        agentId: this.agentId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send deployment log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
