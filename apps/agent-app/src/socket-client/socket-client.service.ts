import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { io, Socket } from "socket.io-client";
import {
  DeploymentStatus,
  DeploymentStatusPayload,
  SocketDeployMessage,
  SocketRemoveMessage,
  DeploymentLogPayload,
  DeploymentEvents,
  AgentHelloPayload,
  ContainerActionRequestPayload,
  ContainerActionResponsePayload,
  ContainerDiscoverRequestPayload,
  ContainerDiscoverResponsePayload,
  DeploymentValidateRequestPayload,
  DeploymentValidateResponsePayload,
  ServerGetResourcesRequestPayload,
  ServerGetResourcesResponsePayload,
  ContainerLogsStartRequestPayload,
  ContainerLogsStartResponsePayload,
  ContainerLogsStopPayload,
  ContainerLogsDataPayload,
  ContainerLogsErrorPayload,
  AgentRemoveRequestPayload,
  AgentRemoveResponsePayload,
} from "@shared/socket-events";
import { ContainerService } from "../container/container.service";
import { ServerResourcesService } from "../server-resources/server-resources.service";
import { DeployTemplateExecutor } from "../executors/deploy-template.executor";
import type { EnvFileInput, PortFileInput } from "../executors/env-file.util";
import {
  EncryptionService,
  TemplatePayloadService,
  SUCCESS_MESSAGES,
  SOCKET_ERROR_MESSAGES,
  logStructured,
  logStructuredError,
} from "@shared/common";
import * as yaml from "js-yaml";
import * as os from "os";

import {
  detectOutboundPublicIp,
  localLoopbackHost,
} from "./agent-public-ip.util";
import {
  InsufficientCpuError,
  InsufficientRamError,
  PortUnavailableError,
} from "../resource-availability/resource-availability.service";

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
    private readonly containerService: ContainerService,
    private readonly serverResourcesService: ServerResourcesService,
  ) {
    this.agentId = this.generateAgentId();
    this.containerService.setLogsDataHandler((sessionId, data) => {
      this.emitContainerLogsData(sessionId, data);
    });
    this.containerService.setLogsErrorHandler((sessionId, error) => {
      this.emitContainerLogsError(sessionId, error);
    });
    this.containerService.setLogsCloseHandler((sessionId) => {
      this.emitContainerLogsStop(sessionId);
    });
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
        logStructured(this.logger, "warn", "socket.connect", "skipped", {
          module: "SocketClientService",
          reason: "already_connected_or_connecting",
        });
        return;
      }

      const controlPanelUrl =
        this.configService.get<string>("CONTROL_PANEL_URL");

      let publicIp = this.configService.get<string>("AGENT_PUBLIC_IP")?.trim();
      if (!publicIp) {
        publicIp = await detectOutboundPublicIp();
        if (publicIp) {
          logStructured(this.logger, "log", "agent.registration", "succeeded", {
            module: "SocketClientService",
            reason: "detected_outbound_public_ip",
          });
        } else {
          publicIp = localLoopbackHost();
          logStructured(this.logger, "log", "agent.registration", "succeeded", {
            module: "SocketClientService",
            reason: "using_loopback_for_local_registration",
          });
        }
      }

      const installServerId = this.configService
        .get<string>("KUBEARA_SERVER_ID")
        ?.trim();

      logStructured(this.logger, "log", "socket.connect", "started", {
        module: "SocketClientService",
        target: controlPanelUrl,
      });

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
      logStructuredError(this.logger, "socket.connect", error, {
        module: "SocketClientService",
      });
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
        logStructured(
          this.logger,
          "log",
          "socket.client_connected",
          "succeeded",
          {
            module: "SocketClientService",
            socketId: this.socket?.id,
          },
        );
        this.attachInboundHandlers();
        this.emitAgentHello();
        this.flushPendingStatuses();
        this.flushPendingLogs();
      });

      this.socket.on("disconnect", (reason) => {
        this.connected = false;
        logStructured(
          this.logger,
          "log",
          "socket.client_disconnected",
          "succeeded",
          {
            module: "SocketClientService",
            reason,
          },
        );
      });

      this.socket.on("connect_error", (error) => {
        logStructuredError(this.logger, "socket.connect", error, {
          module: "SocketClientService",
        });
      });

      this.attachInboundHandlers();
    } catch (error) {
      this.logger.error(
        `Failed to setup socket event listeners: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private attachInboundHandlers(): void {
    if (!this.socket) {
      return;
    }

    this.socket.off(DeploymentEvents.DEPLOY);
    this.socket.off(DeploymentEvents.REMOVE);
    this.socket.off(DeploymentEvents.CONTAINER_ACTION);
    this.socket.off(DeploymentEvents.CONTAINER_DISCOVER);
    this.socket.off(DeploymentEvents.SERVER_GET_RESOURCES);
    this.socket.off(DeploymentEvents.DEPLOYMENT_VALIDATE);
    this.socket.off(DeploymentEvents.CONTAINER_LOGS_START);
    this.socket.off(DeploymentEvents.CONTAINER_LOGS_STOP);
    this.socket.off(DeploymentEvents.AGENT_REMOVE);

    this.socket.on(DeploymentEvents.DEPLOY, (message: SocketDeployMessage) => {
      void this.handleDeployAction(message);
    });

    this.socket.on(DeploymentEvents.REMOVE, (message: SocketRemoveMessage) => {
      void this.handleRemoveAction(message);
    });

    this.socket.on(
      DeploymentEvents.CONTAINER_ACTION,
      (payload: ContainerActionRequestPayload) => {
        logStructured(
          this.logger,
          "log",
          "socket.request_received",
          "started",
          {
            module: "SocketClientService",
            event: DeploymentEvents.CONTAINER_ACTION,
            requestId: payload?.requestId,
            containerId: payload?.containerId,
            action: payload?.action,
          },
        );
        void this.handleContainerAction(payload);
      },
    );

    this.socket.on(
      DeploymentEvents.CONTAINER_DISCOVER,
      (payload: ContainerDiscoverRequestPayload) => {
        logStructured(
          this.logger,
          "log",
          "socket.request_received",
          "started",
          {
            module: "SocketClientService",
            event: DeploymentEvents.CONTAINER_DISCOVER,
            requestId: payload?.requestId,
          },
        );
        void this.handleContainerDiscover(payload);
      },
    );

    this.socket.on(
      DeploymentEvents.SERVER_GET_RESOURCES,
      (payload: ServerGetResourcesRequestPayload) => {
        logStructured(
          this.logger,
          "log",
          "socket.request_received",
          "started",
          {
            module: "SocketClientService",
            event: DeploymentEvents.SERVER_GET_RESOURCES,
            requestId: payload?.requestId,
          },
        );
        void this.handleServerGetResources(payload);
      },
    );

    this.socket.on(
      DeploymentEvents.DEPLOYMENT_VALIDATE,
      (payload: DeploymentValidateRequestPayload) => {
        logStructured(
          this.logger,
          "log",
          "socket.request_received",
          "started",
          {
            module: "SocketClientService",
            event: DeploymentEvents.DEPLOYMENT_VALIDATE,
            requestId: payload?.requestId,
            template: payload?.templateSlug,
          },
        );
        void this.handleDeploymentValidate(payload);
      },
    );

    this.socket.on(
      DeploymentEvents.CONTAINER_LOGS_START,
      (payload: ContainerLogsStartRequestPayload) => {
        void this.handleContainerLogsStart(payload);
      },
    );

    this.socket.on(
      DeploymentEvents.CONTAINER_LOGS_STOP,
      (payload: ContainerLogsStopPayload) => {
        this.handleContainerLogsStop(payload);
      },
    );

    this.socket.on(
      DeploymentEvents.AGENT_REMOVE,
      (payload: AgentRemoveRequestPayload) => {
        void this.handleAgentRemove(payload);
      },
    );

    logStructured(
      this.logger,
      "debug",
      "socket.handlers_registered",
      "succeeded",
      {
        module: "SocketClientService",
      },
    );
  }

  private emitAgentHello(): void {
    if (!this.socket?.connected) {
      return;
    }

    const version =
      process.env.KUBEARA_AGENT_VERSION?.trim() ||
      process.env.GITHUB_SHA?.trim() ||
      "dev";

    const payload: AgentHelloPayload = {
      agentId: this.agentId,
      capabilities: [
        DeploymentEvents.DEPLOY,
        DeploymentEvents.REMOVE,
        DeploymentEvents.CONTAINER_DISCOVER,
        DeploymentEvents.CONTAINER_ACTION,
        DeploymentEvents.SERVER_GET_RESOURCES,
        DeploymentEvents.DEPLOYMENT_VALIDATE,
        DeploymentEvents.CONTAINER_LOGS_START,
        DeploymentEvents.AGENT_REMOVE,
      ],
      version,
      timestamp: new Date().toISOString(),
    };

    this.socket.emit(DeploymentEvents.AGENT_HELLO, payload);
    logStructured(this.logger, "log", "agent.hello", "succeeded", {
      module: "SocketClientService",
      socketId: this.socket.id,
      version,
    });
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
      skipResourceValidation,
    } = message.payload;
    const deploymentId = providedId || this.generateDeploymentId();

    logStructured(
      this.logger,
      "log",
      "deployment.request_received",
      "started",
      {
        module: "SocketClientService",
        deploymentId,
        template: name,
      },
    );

    if (this.inFlightDeployments.has(deploymentId)) {
      logStructured(
        this.logger,
        "warn",
        "deployment.request_received",
        "skipped",
        {
          module: "SocketClientService",
          deploymentId,
          reason: "duplicate_in_flight",
        },
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
      status: DeploymentStatus.PENDING,
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
        throw new Error(SOCKET_ERROR_MESSAGES.MISSING_DEPLOYMENT_SCHEMA(name));
      }

      logStructured(this.logger, "log", "deployment.execute", "started", {
        module: "SocketClientService",
        deploymentId,
        template: name,
      });
      await this.executor.execute({
        name,
        compose: composeYaml,
        env: { env: envValues, ports: portValues },
        deploymentId,
        schema,
        composeOnly,
        useTraefik,
        skipResourceValidation,
        notifier: this,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStructuredError(this.logger, "deployment.initialize", err, {
        module: "SocketClientService",
        deploymentId,
        template: name,
      });

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
        status: DeploymentStatus.FAILED,
        message: msg,
        error: msg,
      });
    } finally {
      this.inFlightDeployments.delete(deploymentId);
    }
  }

  /**
   * Handles on-demand server resource metric requests from the control panel.
   */
  private async handleServerGetResources(
    payload: ServerGetResourcesRequestPayload,
  ): Promise<void> {
    const requestId = payload?.requestId?.trim() ?? "";
    this.logger.log(
      `Server get-resources request received requestId=${requestId}`,
    );

    let response: ServerGetResourcesResponsePayload;
    try {
      response = requestId
        ? await this.serverResourcesService.collectResources(requestId)
        : {
            requestId: "",
            error: SOCKET_ERROR_MESSAGES.MISSING_REQUEST_ID,
          };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Server get-resources handler failed: ${message}`);
      response = { requestId, error: message };
    }

    if (!this.socket?.connected) {
      this.logger.warn(
        "Cannot send server get-resources result: socket disconnected",
      );
      return;
    }

    this.socket.emit(DeploymentEvents.SERVER_GET_RESOURCES_RESULT, response);
    this.logger.log(
      `Server get-resources result sent requestId=${requestId}${response.error ? ` error=${response.error}` : ""}`,
    );
  }

  /**
   * Handles pre-deploy validation (RAM, ports, CPU) from the control panel.
   */
  private async handleDeploymentValidate(
    payload: DeploymentValidateRequestPayload,
  ): Promise<void> {
    const requestId = payload?.requestId?.trim() ?? "";
    const templateSlug = payload?.templateSlug?.trim() ?? "";

    let response: DeploymentValidateResponsePayload = {
      requestId,
      available: false,
      error: SOCKET_ERROR_MESSAGES.MISSING_REQUEST_ID,
    };

    try {
      if (!requestId || !templateSlug || !payload.compose) {
        response = {
          requestId,
          available: false,
          error: SOCKET_ERROR_MESSAGES.MISSING_REQUEST_ID_TEMPLATE_COMPOSE,
        };
      } else {
        const decryptedEncodedCompose = this.encryptionService.decrypt(
          payload.compose,
        );
        const composeObj = this.templatePayloadService.decodeBase64ToObject(
          decryptedEncodedCompose,
        );
        const composeYaml = yaml.dump(composeObj, {
          lineWidth: -1,
          noRefs: true,
        });

        const envValues: EnvFileInput = payload.env
          ? (this.decryptAndParse(payload.env) as EnvFileInput)
          : {};
        const portValues: PortFileInput = payload.ports
          ? (this.decryptAndParse(payload.ports) as PortFileInput)
          : {};

        if (!payload.composeOnly && !payload.schema) {
          throw new Error(
            SOCKET_ERROR_MESSAGES.MISSING_DEPLOYMENT_SCHEMA(templateSlug),
          );
        }

        await this.executor.validateBeforeDeploy({
          name: templateSlug,
          compose: composeYaml,
          env: { env: envValues, ports: portValues },
          schema: payload.schema,
          composeOnly: payload.composeOnly,
          useTraefik: payload.useTraefik,
        });

        response = { requestId, available: true };
      }
    } catch (error) {
      if (error instanceof InsufficientRamError) {
        this.logger.warn(
          `Deployment validation resource warning requestId=${requestId}: ${error.message}`,
        );
        response = {
          requestId,
          available: false,
          warning: {
            code: "insufficient_ram",
            message: error.message,
          },
        };
      } else if (error instanceof InsufficientCpuError) {
        this.logger.warn(
          `Deployment validation resource warning requestId=${requestId}: ${error.message}`,
        );
        response = {
          requestId,
          available: false,
          warning: {
            code: "insufficient_cpu",
            message: error.message,
          },
        };
      } else {
        const message =
          error instanceof PortUnavailableError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        this.logger.warn(
          `Deployment validation failed requestId=${requestId}: ${message}`,
        );
        response = {
          requestId,
          available: false,
          error: message,
        };
      }
    }

    if (!this.socket?.connected) {
      this.logger.warn(
        "Cannot send deployment validation result: socket disconnected",
      );
      return;
    }

    this.socket.emit(DeploymentEvents.DEPLOYMENT_VALIDATE_RESULT, response);
    this.logger.log(
      `Deployment validation result sent requestId=${requestId} available=${response.available}`,
    );
  }

  /**
   * Handles container lifecycle actions from the control panel.
   */
  private async handleContainerAction(
    payload: ContainerActionRequestPayload,
  ): Promise<void> {
    const requestId = payload?.requestId?.trim() ?? "";
    const containerId = payload?.containerId?.trim() ?? "";
    const action = payload?.action;

    this.logger.log(
      `Container action request received action=${action ?? "unknown"} containerId=${containerId} requestId=${requestId}`,
    );

    let response: ContainerActionResponsePayload;
    try {
      if (!requestId || !containerId || !action) {
        response = {
          requestId,
          containerId,
          action: action ?? "stop",
          success: false,
          stdout: "",
          stderr: "",
          exitCode: 1,
          error: SOCKET_ERROR_MESSAGES.MISSING_REQUEST_ID_CONTAINER_ACTION,
        };
      } else {
        response = await this.containerService.executeAction(
          requestId,
          containerId,
          action,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Container action handler failed: ${message}`);
      response = {
        requestId,
        containerId,
        action: action ?? "stop",
        success: false,
        stdout: "",
        stderr: "",
        exitCode: 1,
        error: message,
      };
    }

    if (!this.socket?.connected) {
      this.logger.warn(
        "Cannot send container action result: socket disconnected",
      );
      return;
    }

    this.socket.emit(DeploymentEvents.CONTAINER_ACTION_RESULT, response);
    this.logger.log(
      `Container action result sent requestId=${requestId} action=${response.action} success=${response.success}${response.error ? ` error=${response.error}` : ""}`,
    );
  }

  /**
   * Handles container logs start requests from the control panel.
   */
  private async handleContainerLogsStart(
    payload: ContainerLogsStartRequestPayload,
  ): Promise<void> {
    const requestId = payload?.requestId?.trim() ?? "";
    const sessionId = payload?.sessionId?.trim() ?? "";
    const containerId = payload?.containerId?.trim() ?? "";

    let response: ContainerLogsStartResponsePayload;

    try {
      if (!requestId || !sessionId || !containerId) {
        response = {
          requestId,
          sessionId,
          error: SOCKET_ERROR_MESSAGES.MISSING_REQUEST_ID_CONTAINER_LOGS_START,
        };
      } else {
        const startError = await this.containerService.startLogStream(
          sessionId,
          containerId,
        );
        response = startError
          ? { requestId, sessionId, error: startError }
          : { requestId, sessionId };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Container logs start handler failed: ${message}`);
      response = { requestId, sessionId, error: message };
    }

    if (!this.socket?.connected) {
      this.logger.warn(
        "Cannot send container logs start result: socket disconnected",
      );
      if (!response.error) {
        this.containerService.stopLogStream(sessionId);
      }
      return;
    }

    this.socket.emit(DeploymentEvents.CONTAINER_LOGS_START_RESULT, response);
    this.logger.log(
      `Container logs start result sent requestId=${requestId}${response.error ? ` error=${response.error}` : ""}`,
    );
  }

  /**
   * Handles container logs stop requests from the control panel.
   */
  private handleContainerLogsStop(payload: ContainerLogsStopPayload): void {
    const sessionId = payload?.sessionId?.trim() ?? "";
    if (!sessionId) {
      return;
    }

    this.containerService.stopLogStream(sessionId);
  }

  /**
   * Emits container logs data to the control panel.
   */
  private emitContainerLogsData(sessionId: string, data: string): void {
    if (!this.socket?.connected) {
      return;
    }

    const payload: ContainerLogsDataPayload = { sessionId, data };
    this.socket.emit(DeploymentEvents.CONTAINER_LOGS_DATA, payload);
  }

  /**
   * Emits container logs error to the control panel.
   */
  private emitContainerLogsError(sessionId: string, error: string): void {
    if (!this.socket?.connected) {
      return;
    }

    const payload: ContainerLogsErrorPayload = { sessionId, error };
    this.socket.emit(DeploymentEvents.CONTAINER_LOGS_ERROR, payload);
  }

  /**
   * Emits container logs stop to the control panel.
   */
  private emitContainerLogsStop(sessionId: string): void {
    if (!this.socket?.connected) {
      return;
    }

    const payload: ContainerLogsStopPayload = { sessionId };
    this.socket.emit(DeploymentEvents.CONTAINER_LOGS_STOP, payload);
  }

  /**
   * Handles container discover requests from the control panel.
   */
  private async handleContainerDiscover(
    payload: ContainerDiscoverRequestPayload,
  ): Promise<void> {
    const requestId = payload?.requestId?.trim() ?? "";
    this.logger.log(
      `Container discover request received requestId=${requestId}`,
    );

    let response: ContainerDiscoverResponsePayload;
    try {
      response = requestId
        ? await this.containerService.discoverContainers(requestId)
        : {
            requestId: "",
            containers: [],
            error: SOCKET_ERROR_MESSAGES.MISSING_REQUEST_ID,
          };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Container discover handler failed: ${message}`);
      response = { requestId, containers: [], error: message };
    }

    if (!this.socket?.connected) {
      this.logger.warn(
        "Cannot send container discover result: socket disconnected",
      );
      return;
    }

    this.socket.emit(DeploymentEvents.CONTAINER_DISCOVER_RESULT, response);
    this.logger.log(
      `Container discover result sent requestId=${requestId} count=${response.containers.length}${response.error ? ` error=${response.error}` : ""}`,
    );
  }

  /**
   * Handles removal requests from the control panel and tears down deployment resources.
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
        status: DeploymentStatus.FAILED,
        message: msg,
        error: msg,
      });
    }
  }

  /**
   * Handles agent removal requests from the control panel.
   */
  private async handleAgentRemove(
    payload: AgentRemoveRequestPayload,
  ): Promise<void> {
    const requestId = payload?.requestId?.trim() ?? "";
    const installDir = payload?.installDir?.trim() || "/opt/kubeara/agent";
    const agentImage = payload?.agentImage?.trim();

    let response: AgentRemoveResponsePayload;

    try {
      if (!requestId) {
        response = {
          requestId: "",
          success: false,
          error: SOCKET_ERROR_MESSAGES.MISSING_REQUEST_ID,
        };
      } else {
        const imageRefs = await this.executor.collectAgentRemovalTargets({
          agentImage,
        });
        response = { requestId, success: true, imageRefs };

        if (!this.socket?.connected) {
          this.logger.warn(
            "Cannot send agent remove result: socket disconnected",
          );
          return;
        }

        this.socket.emit(DeploymentEvents.AGENT_REMOVE_RESULT, response);
        this.logger.log(
          `Agent remove result sent requestId=${requestId} success=true imageRefs=${imageRefs.join(", ") || "none"}`,
        );

        void this.executor
          .runAgentRemovalAfterAck({
            installDir,
            imageRefs,
          })
          .catch((err) => {
            this.logger.error(
              `Post-ack agent removal failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Agent remove handler failed: ${message}`);
      response = { requestId, success: false, error: message };
    }

    if (!this.socket?.connected) {
      this.logger.warn("Cannot send agent remove result: socket disconnected");
      return;
    }

    this.socket.emit(DeploymentEvents.AGENT_REMOVE_RESULT, response);
    this.logger.log(
      `Agent remove result sent requestId=${requestId} success=${response.success}${response.error ? ` error=${response.error}` : ""}`,
    );
  }

  /**
   * Decrypts and parses encrypted data.
   */
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

  /**
   * Emits deployment status payload to control panel when socket is connected.
   */
  private emitDeploymentStatus(payload: DeploymentStatusPayload): void {
    this.socket?.emit(DeploymentEvents.DEPLOYMENT_STATUS, {
      ...payload,
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Queues a deployment status for sending when the socket is connected.
   */
  private queuePendingStatus(payload: DeploymentStatusPayload): void {
    this.pendingStatuses.push(payload);
    if (this.pendingStatuses.length > SocketClientService.MAX_PENDING_LOGS) {
      this.pendingStatuses.shift();
    }
  }

  /**
   * Flushes queued deployment statuses when the socket is connected.
   */
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

  /**
   * Queues a deployment log for sending when the socket is connected.
   */
  private queuePendingLog(payload: DeploymentLogPayload): void {
    logStructured(this.logger, "warn", "deployment.log_stream", "retry", {
      module: "SocketClientService",
      deploymentId: payload.deploymentId ?? undefined,
      reason: "socket_disconnected",
      bytes: payload.message?.length ?? 0,
    });
    this.pendingLogs.push(payload);
    if (this.pendingLogs.length > SocketClientService.MAX_PENDING_LOGS) {
      this.pendingLogs.shift();
    }
    this.logger.debug(
      `Queued deployment log (socket disconnected): deployment=${payload.deployment} deploymentId=${payload.deploymentId ?? "n/a"}`,
    );
  }

  /**
   * Flushes queued deployment logs when the socket is connected.
   */
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

  /**
   * Emits a deployment log to the control panel.
   */
  private emitDeploymentLog(payload: DeploymentLogPayload): void {
    if (!payload.deploymentId) {
      logStructured(this.logger, "warn", "deployment.log_stream", "skipped", {
        module: "SocketClientService",
        deployment: payload.deployment,
        reason: "missing_deployment_id",
      });
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

    logStructured(this.logger, "debug", "deployment.log_stream", "started", {
      module: "SocketClientService",
      deploymentId: outbound.deploymentId,
      source,
      bytes: outbound.message.length,
    });
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
