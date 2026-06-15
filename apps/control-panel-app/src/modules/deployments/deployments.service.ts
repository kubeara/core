import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Not, Repository } from "typeorm";

import {
  ComposeParserService,
  EncryptionService,
  ServerUrlContext,
  SUCCESS_MESSAGES,
  TemplateConfigService,
  TemplatePayloadService,
  maskEnvMap,
} from "@shared/common";
import {
  ContainerActionResponsePayload,
  ContainerActionType,
  DeploymentEvents,
  DeploymentStatus,
  SchemaFieldDetails,
  TemplateSchema,
  SocketDeployMessage,
  SocketRemoveMessage,
} from "@shared/socket-events";

import { DeploymentGateway } from "@control-panel/websocket/websocket.gateway";
import { EntityStatus } from "@control-panel/common/entity/entity-status";
import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { LocalServerService } from "@control-panel/modules/server-connections/services/local-server.service";
import { AGENT_INSTALL } from "@control-panel/modules/server-connections/constants/agent-install.constants";
import { ServerConnectionsService } from "@control-panel/modules/server-connections/services/server-connections.service";
import { EnvironmentVariableEntity } from "./entities/environment-variable.entity";
import { ServiceDeploymentEntity } from "./entities/service-deployment.entity";
import { ServiceTemplateEntity } from "@control-panel/modules/service-template/entities/service-template.entity";
import {
  BuildServerUrlContextInput,
  PrepareDeploymentInput,
  PreparedDeployment,
  ResolveDeploymentServerInput,
  ResolvedDeploymentTarget,
} from "./dto/deployment.types";
import { normalizeServerHostForUrls } from "./utils/deployment-server.util";
import type { ContainerActionResponseDto } from "./dto/container-action-response.dto";
import type { ContainerLogsStartResponseDto } from "./dto/container-logs.dto";
import type { ServerContainerDto } from "./dto/server-container.dto";
import {
  mergeDiscoveredContainersWithDeployments,
  sanitizeDeploymentProjectName,
} from "./utils/container-discovery.util";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES as CP_SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { assertValidContainerId } from "./utils/container-action.util";
import type { EnvironmentVariableView } from "./interfaces/deployments.interface";

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(
    @InjectRepository(ServiceDeploymentEntity)
    private readonly deploymentRepository: Repository<ServiceDeploymentEntity>,
    @InjectRepository(EnvironmentVariableEntity)
    private readonly environmentVariableRepository: Repository<EnvironmentVariableEntity>,
    @InjectRepository(ServiceTemplateEntity)
    private readonly templateRepository: Repository<ServiceTemplateEntity>,
    private readonly serverConnectionsService: ServerConnectionsService,
    private readonly localServerService: LocalServerService,
    private readonly templatePayloadService: TemplatePayloadService,
    private readonly templateConfigService: TemplateConfigService,
    private readonly composeParserService: ComposeParserService,
    private readonly encryptionService: EncryptionService,
    @Inject(forwardRef(() => DeploymentGateway))
    private readonly deploymentGateway: DeploymentGateway,
  ) {}

  generateDeploymentId(): string {
    return `deployment-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Resolves deploy target server and owning user (from server row or existing deployment).
   */
  async resolveDeploymentTarget(
    input: ResolveDeploymentServerInput,
  ): Promise<ResolvedDeploymentTarget> {
    try {
      const serverId = await this.resolveDeploymentServerId(input);
      const server = await this.assertActiveServerForUser(
        serverId,
        input.userId,
      );

      if (input.existingDeploymentId) {
        const deployment = await this.getDeployment(input.existingDeploymentId);
        if (deployment.userId) {
          return { serverId, userId: deployment.userId };
        }
      }

      return { serverId, userId: server.userId };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to resolve deployment target: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolves which server a deploy targets.
   * - Redeploy: uses stored `server_id`, or `serverId` / `deployOnLocal` when legacy row has no server.
   * - New deploy: requires `serverId` or `deployOnLocal` (creates per-user local server on first use).
   */
  async resolveDeploymentServerId(
    input: ResolveDeploymentServerInput,
  ): Promise<string> {
    try {
      if (input.existingDeploymentId) {
        const deployment = await this.getDeployment(input.existingDeploymentId);
        const storedServerId = deployment.serverId;

        if (
          input.serverId &&
          storedServerId &&
          input.serverId !== storedServerId
        ) {
          throw new BadRequestException(
            `Cannot change target server on redeploy (deployment uses server '${storedServerId}')`,
          );
        }

        if (storedServerId) {
          await this.assertActiveServerForUser(storedServerId, input.userId);
          return storedServerId;
        }

        if (input.serverId) {
          await this.assertActiveServerForUser(input.serverId, input.userId);
          return input.serverId;
        }

        if (input.deployOnLocal) {
          return (await this.localServerService.ensureLocalServer(input.userId))
            .id;
        }

        throw new BadRequestException(
          "Deployment has no target server. Provide serverId or set deployOnLocal=true.",
        );
      }

      if (input.serverId) {
        await this.assertActiveServerForUser(input.serverId, input.userId);
        return input.serverId;
      }

      if (input.deployOnLocal) {
        return (await this.localServerService.ensureLocalServer(input.userId))
          .id;
      }

      throw new BadRequestException(
        "Provide serverId or set deployOnLocal=true for local machine deploy.",
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to resolve deployment server: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Loads an active server row owned by the given user.
   */
  async assertActiveServerForUser(
    serverId: string,
    userId: string,
  ): Promise<ServerEntity> {
    try {
      const server = await this.serverConnectionsService.findOne({
        where: { id: serverId, userId, status: EntityStatus.ACTIVE },
      });

      if (!server) {
        throw new NotFoundException(
          `Server '${serverId}' not found, inactive, or not accessible`,
        );
      }

      return server;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to load server '${serverId}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensures an agent is connected for the given server before emitting deploy/remove.
   * When disconnected, runs the same prerequisite + docker-compose install as onboard (local or SSH).
   */
  async ensureAgentConnectedForServer(
    serverId: string,
    options?: {
      deploymentId?: string;
      onInstallLogLine?: (line: string) => void;
    },
  ): Promise<void> {
    try {
      if (this.deploymentGateway.isAgentConnectedForServer(serverId)) {
        return;
      }

      const deploymentId = options?.deploymentId?.trim();
      const streamInstallLine = (line: string) => {
        options?.onInstallLogLine?.(line);
        if (deploymentId) {
          this.deploymentGateway.broadcastDeploymentLog({
            deploymentId,
            serverId,
            deployment: "agent-install",
            type: "stdout",
            message: line,
            timestamp: new Date().toISOString(),
            source: "install",
          });
        }
      };

      this.logger.log(
        `No agent WebSocket for server '${serverId}'; ensuring agent is running on host...`,
      );

      if (deploymentId) {
        streamInstallLine(
          "No agent WebSocket — checking remote agent (install only if not already running)…",
        );
      }

      const install =
        await this.serverConnectionsService.ensureAgentInstalledForServer(
          serverId,
          { onLogLine: streamInstallLine },
        );

      if (!install.success) {
        const logTail = install.logs.slice(-8).join("; ");
        throw new ConflictException(
          install.error ??
            `Agent install failed for server '${serverId}'.` +
              (logTail ? ` ${logTail}` : ""),
        );
      }

      const installSkipped = install.skipped === true;

      if (deploymentId) {
        streamInstallLine(
          installSkipped
            ? "Agent container already running — waiting for WebSocket connection…"
            : "Agent installed — waiting for agent WebSocket connection…",
        );
      }

      await this.waitForAgentConnection(serverId);

      if (!this.deploymentGateway.isAgentConnectedForServer(serverId)) {
        throw new ConflictException(
          installSkipped
            ? `Agent container is running on server '${serverId}' but did not connect within ${AGENT_INSTALL.CONNECT_WAIT_MS / 1000}s. ` +
                "Check `docker logs kubeara-agent` and CONTROL_PANEL_URL in /opt/kubeara/agent/.env.agent (must reach this control panel)."
            : `Agent was installed for server '${serverId}' but did not connect within ${AGENT_INSTALL.CONNECT_WAIT_MS / 1000}s. ` +
                "Check agent container logs and CONTROL_PANEL_URL (e.g. http://host.docker.internal:3000 for local Docker).",
        );
      }

      if (deploymentId) {
        streamInstallLine("Agent connected.");
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to verify agent connection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async waitForAgentConnection(serverId: string): Promise<void> {
    const deadline = Date.now() + AGENT_INSTALL.CONNECT_WAIT_MS;
    while (Date.now() < deadline) {
      if (this.deploymentGateway.isAgentConnectedForServer(serverId)) {
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, AGENT_INSTALL.CONNECT_POLL_MS),
      );
    }
  }

  /**
   * Builds URL generation context for SERVICE_URL_* / SERVICE_FQDN_* and Traefik-oriented resolution.
   *
   * Precedence:
   * - If the client sends `useTraefik`, that value wins.
   * - Else if the client passes any `SERVICE_PORT_*` host binding in `ports` or `env`, Traefik is off
   *   so declared ports are not stripped for that deploy.
   * - Else default from `TRAEFIK_ENABLED` on the **control panel** process (not the agent `.env`).
   *
   * Templates such as n8n with `SERVICE_URL_*` / `SERVICE_FQDN_*` work without Traefik when
   * `useTraefik` is false and a `SERVICE_PORT_*` is supplied (or auto-filled). To force direct
   * host ports: `"useTraefik": false` and `"ports": { "SERVICE_PORT_N8N": 5678 }`.
   */
  async buildServerUrlContext(
    options: BuildServerUrlContextInput,
  ): Promise<Omit<ServerUrlContext, "deploymentId">> {
    try {
      const {
        serverId,
        useTraefikRequest,
        requestEnv = {},
        requestPorts = {},
      } = options;

      const server = await this.assertActiveServerForUser(
        serverId,
        options.userId,
      );
      const publicIp = normalizeServerHostForUrls(server.host);

      let useTraefik: boolean;
      if (useTraefikRequest !== undefined) {
        useTraefik = Boolean(useTraefikRequest);
      } else if (
        this.requestContainsExplicitServiceHostPorts(requestPorts, requestEnv)
      ) {
        useTraefik = false;
      } else {
        useTraefik = process.env.TRAEFIK_ENABLED === "true";
      }

      return {
        publicIp,
        wildcardDomain: process.env.WILDCARD_DOMAIN ?? null,
        forceHttps: process.env.FORCE_HTTPS === "true",
        useTraefik,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to build server URL context: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Encrypts prepared deployment payload and emits DEPLOY to connected agents.
   */
  async emitPreparedDeployment(
    prepared: PreparedDeployment,
    isRedeploy: boolean,
  ): Promise<{
    message: string;
    template: string;
    deploymentId: string;
    serverId: string;
  }> {
    try {
      this.logger.debug(
        `[emitPreparedDeployment] deploymentId=${prepared.deploymentId} serverId=${prepared.serverId} mergedPorts=${JSON.stringify(prepared.mergedPorts)}`,
      );

      const encryptedCompose = this.encryptionService.encrypt(
        prepared.encodedCompose,
      );
      const encryptedEnv = this.encryptionService.encrypt(
        JSON.stringify(prepared.mergedEnv),
      );
      const encryptedPorts = this.encryptionService.encrypt(
        JSON.stringify(prepared.mergedPorts),
      );

      const message: SocketDeployMessage = {
        type: "DEPLOY",
        payload: {
          name: prepared.templateSlug,
          compose: encryptedCompose,
          env: encryptedEnv,
          ports: encryptedPorts,
          deploymentId: prepared.deploymentId,
          schema: prepared.schema,
          composeOnly: prepared.composeOnly,
          useTraefik: prepared.useTraefik,
        },
      };

      await this.ensureAgentConnectedForServer(prepared.serverId, {
        deploymentId: prepared.deploymentId,
      });
      this.logger.log(
        `[DEPLOY_TRACE] emitPreparedDeployment calling emitDeploy deploymentId=${prepared.deploymentId} serverId=${prepared.serverId}`,
      );
      this.deploymentGateway.emitDeploy(message, prepared.serverId);

      this.deploymentGateway.broadcastDeploymentLog({
        deploymentId: prepared.deploymentId,
        serverId: prepared.serverId,
        deployment: prepared.templateSlug,
        type: "stdout",
        phase: "deploy",
        message:
          "Deploy command sent to agent — watch below for agent compose output (containers use Docker project name derived from deployment id).",
        timestamp: new Date().toISOString(),
        source: "deployment",
      });

      return {
        message: isRedeploy ? "Redeployment initiated" : "Deployment initiated",
        template: prepared.templateSlug,
        deploymentId: prepared.deploymentId,
        serverId: prepared.serverId,
      };
    } catch (error) {
      await this.markDeploymentFailed(prepared.deploymentId, error);
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to emit deployment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns immediately after prepare; runs install + deploy in the background so
   * the console can subscribe to the deployment log stream while work is in progress.
   */
  schedulePreparedDeployment(
    prepared: PreparedDeployment,
    isRedeploy: boolean,
  ): {
    message: string;
    template: string;
    deploymentId: string;
    serverId: string;
  } {
    // Defer so the HTTP 202 + deploymentId reach the console and logs:subscribe runs
    // before install/deploy output (setImmediate was too early vs browser subscribe).
    const subscribeGraceMs = 300;
    setTimeout(() => {
      void this.emitPreparedDeployment(prepared, isRedeploy).catch(
        (error: unknown) => {
          this.logger.error(
            `Background deployment ${prepared.deploymentId} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      );
    }, subscribeGraceMs);

    return {
      message: isRedeploy ? "Redeployment started" : "Deployment started",
      template: prepared.templateSlug,
      deploymentId: prepared.deploymentId,
      serverId: prepared.serverId,
    };
  }

  async prepareDeployment(
    input: PrepareDeploymentInput,
  ): Promise<PreparedDeployment> {
    const {
      templateSlug,
      serverId,
      userId,
      requestEnv = {},
      requestPorts = {},
      existingDeploymentId,
    } = input;

    const template = await this.templateRepository.findOne({
      where: { slug: templateSlug },
    });
    if (!template?.compose) {
      throw new NotFoundException(`Template '${templateSlug}' not found`);
    }

    const hasSchema = Boolean(template.envSchema || template.portSchema);
    if (!hasSchema) {
      return this.prepareComposeDeployment(input);
    }

    const schema: TemplateSchema = {
      env_schema: template.envSchema as Record<string, SchemaFieldDetails>,
      port_schema: template.portSchema as Record<string, SchemaFieldDetails>,
    };
    const normalized = this.templateConfigService.normalizeSchema(schema);
    const portSchemaKeys = Object.keys(schema.port_schema ?? {});

    let baseEnv: Record<string, unknown> = { ...requestEnv };
    let basePorts: Record<string, unknown> = { ...requestPorts };

    if (existingDeploymentId) {
      const stored = await this.loadStoredVariables(
        existingDeploymentId,
        portSchemaKeys,
      );
      baseEnv = { ...stored.env, ...requestEnv };
      basePorts = { ...stored.ports, ...requestPorts };
    }

    const composeYaml = this.templatePayloadService.decodeBase64ToYaml(
      template.compose,
    );
    const parsedFromCompose = this.composeParserService.resolveFromCompose({
      compose: composeYaml,
      userEnv: baseEnv,
      userPorts: basePorts,
      portSchemaKeys,
    });

    const { env: mergedEnv, ports: mergedPorts } =
      this.templateConfigService.mergeAndValidate(
        { ...schema, normalized },
        { env: parsedFromCompose.env, ports: parsedFromCompose.ports },
      );

    const deploymentId = existingDeploymentId ?? this.generateDeploymentId();

    try {
      await this.upsertDeploymentRecord({
        deploymentId,
        templateSlug,
        serverId,
        userId,
        deploymentStatus: "pending",
      });

      await this.persistEnvironmentVariables({
        deploymentId,
        env: mergedEnv,
        ports: mergedPorts,
        generatedKeys: parsedFromCompose.generatedKeys,
        schema,
      });
    } catch (error) {
      await this.markDeploymentFailed(deploymentId, error);
      throw error;
    }

    if (parsedFromCompose.generatedKeys.length > 0) {
      this.logger.log(
        `Stored auto-generated variables for '${deploymentId}': ${parsedFromCompose.generatedKeys.join(", ")}`,
      );
    }

    const useTraefik = this.resolveUseTraefikForCompose(
      composeYaml,
      input.serverUrlContext?.useTraefik,
      templateSlug,
    );

    return {
      deploymentId,
      serverId,
      userId,
      templateSlug,
      encodedCompose: template.compose,
      mergedEnv,
      mergedPorts,
      generatedKeys: parsedFromCompose.generatedKeys,
      schema: { ...schema, normalized },
      composeOnly: false,
      useTraefik,
    };
  }

  /**
   * Coolify-style deploy: resolve and validate env entirely from docker-compose.yml
   * (no template.config.json / env_schema / port_schema).
   */
  async prepareComposeDeployment(
    input: PrepareDeploymentInput,
  ): Promise<PreparedDeployment> {
    const {
      templateSlug,
      serverId,
      userId,
      requestEnv = {},
      requestPorts = {},
      existingDeploymentId,
      serverUrlContext: serverUrlContextInput,
    } = input;

    const template = await this.templateRepository.findOne({
      where: { slug: templateSlug },
    });
    if (!template?.compose) {
      throw new NotFoundException(`Template '${templateSlug}' not found`);
    }

    const deploymentId = existingDeploymentId ?? this.generateDeploymentId();
    const serverUrlContext: ServerUrlContext | undefined = serverUrlContextInput
      ? { ...serverUrlContextInput, deploymentId }
      : undefined;

    let baseEnv: Record<string, unknown> = { ...requestEnv };
    let basePorts: Record<string, unknown> = { ...requestPorts };

    if (existingDeploymentId) {
      const stored = await this.loadStoredVariables(existingDeploymentId, []);
      baseEnv = { ...stored.env, ...requestEnv };
      basePorts = { ...stored.ports, ...requestPorts };
      this.logger.debug(
        `[prepareComposeDeployment] merged redeploy ports deploymentId=${deploymentId} basePorts=${JSON.stringify(basePorts)}`,
      );
    }

    const composeYaml = this.templatePayloadService.decodeBase64ToYaml(
      template.compose,
    );

    const unknownPortKeys = this.composeParserService.findUnknownPortKeys(
      composeYaml,
      requestPorts,
    );
    if (unknownPortKeys.length > 0) {
      const expected = this.composeParserService.listPortVariables(composeYaml);
      throw new BadRequestException(
        `Unknown port keys: ${unknownPortKeys.join(", ")}. ` +
          `Template '${templateSlug}' expects: ${expected.join(", ") || "(none)"}`,
      );
    }

    const inferOptions = serverUrlContext ? { serverUrlContext } : undefined;

    const requiredPortVars = this.composeParserService
      .inferRequiredVariables(composeYaml, inferOptions)
      .filter((name) => name.startsWith("SERVICE_PORT_"));

    if (template.port && requiredPortVars.length === 1) {
      const portVar = requiredPortVars[0];
      if (basePorts[portVar] === undefined && baseEnv[portVar] === undefined) {
        basePorts[portVar] = template.port;
        this.logger.debug(
          `[prepareComposeDeployment] applied template default port deploymentId=${deploymentId} ${portVar}=${template.port}`,
        );
      }
    }

    let parsedFromCompose;
    try {
      parsedFromCompose =
        this.composeParserService.resolveAndValidateFromCompose({
          compose: composeYaml,
          userEnv: baseEnv,
          userPorts: basePorts,
          serverUrlContext,
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const required = this.composeParserService.inferRequiredVariables(
        composeYaml,
        inferOptions,
      );
      const hint =
        required.length > 0
          ? ` Required: ${required.join(", ")}. Pass them in "ports" or "env".`
          : "";
      if (!serverUrlContext && composeYaml.includes("SERVICE_URL_")) {
        throw new BadRequestException(
          `${message}.${hint} Connect an agent with AGENT_PUBLIC_IP set for auto URL generation.`,
        );
      }
      throw new BadRequestException(`${message}.${hint}`);
    }

    const mergedEnv = parsedFromCompose.env;
    const mergedPorts = parsedFromCompose.ports;

    const requiredKeys = new Set(
      this.composeParserService.inferRequiredVariables(
        composeYaml,
        inferOptions,
      ),
    );

    try {
      await this.upsertDeploymentRecord({
        deploymentId,
        templateSlug,
        serverId,
        userId,
        deploymentStatus: "pending",
      });

      await this.persistEnvironmentVariables({
        deploymentId,
        env: mergedEnv,
        ports: mergedPorts,
        generatedKeys: parsedFromCompose.generatedKeys,
        requiredKeys,
      });
    } catch (error) {
      await this.markDeploymentFailed(deploymentId, error);
      throw error;
    }

    if (parsedFromCompose.generatedKeys.length > 0) {
      this.logger.log(
        `Stored auto-generated variables for '${deploymentId}': ${parsedFromCompose.generatedKeys.join(", ")}`,
      );
    }

    const useTraefik = this.resolveUseTraefikForCompose(
      composeYaml,
      serverUrlContext?.useTraefik,
      templateSlug,
    );

    return {
      deploymentId,
      serverId,
      userId,
      templateSlug,
      encodedCompose: template.compose,
      mergedEnv,
      mergedPorts,
      generatedKeys: parsedFromCompose.generatedKeys,
      composeOnly: true,
      useTraefik,
    };
  }

  private static readonly OVERVIEW_EXCLUDED_STATUSES: DeploymentStatus[] = [
    "failed",
    "pending",
    "validating",
    "pulling",
    "building",
    "deploying",
    "cancelled",
    "removing",
    "removed",
  ];

  /**
   * Lists runtime containers on a server merged with Kubeara deployment records.
   * Discovery is not persisted; failed deployments are omitted from the overview.
   */
  async listServerContainers(
    serverId: string,
    userId: string,
  ): Promise<ServerContainerDto[]> {
    await this.assertActiveServerForUser(serverId, userId);

    const discovered =
      await this.serverConnectionsService.discoverContainers(serverId);

    const deploymentRows = await this.deploymentRepository.find({
      where: {
        serverId,
        deletedAt: IsNull(),
        deploymentStatus: Not(
          In(DeploymentsService.OVERVIEW_EXCLUDED_STATUSES),
        ),
      },
      relations: { template: true },
      order: { updatedAt: "DESC" },
    });

    const deployments = deploymentRows.map((deployment) => ({
      id: deployment.id,
      templateSlug: deployment.templateSlug,
      serviceName: deployment.template?.name?.trim() || null,
      composeProject: sanitizeDeploymentProjectName(deployment.id),
    }));

    return mergeDiscoveredContainersWithDeployments(
      discovered,
      deployments,
      serverId,
    );
  }

  /**
   * Executes a container lifecycle action via the connected agent, with host SSH/local fallback.
   */
  async executeContainerAction(
    serverId: string,
    userId: string,
    containerId: string,
    action: ContainerActionType,
  ): Promise<ContainerActionResponseDto> {
    await this.assertActiveServerForUser(serverId, userId);
    const safeContainerId = assertValidContainerId(containerId);

    let result: ContainerActionResponsePayload | null = null;
    let socketError: string | null = null;
    let executedVia: ContainerActionResponseDto["executedVia"] = "agent";

    if (this.deploymentGateway.isAgentConnectedForServer(serverId)) {
      const agentVersion =
        this.deploymentGateway.getAgentVersion(serverId) ?? "unknown";
      const supportsContainerAction = this.deploymentGateway.agentSupports(
        serverId,
        DeploymentEvents.CONTAINER_ACTION,
      );

      this.logger.log(
        `[CONTAINER_ACTION] serverId=${serverId} agentVersion=${agentVersion} supportsContainerAction=${supportsContainerAction}`,
      );

      if (!supportsContainerAction) {
        socketError = `Connected agent (version ${agentVersion}) does not support container actions — rebuild or update the agent image to include the container:action handler`;
        this.logger.warn(
          `[CONTAINER_ACTION] skipping socket for server '${serverId}': ${socketError}`,
        );
      } else {
        try {
          result = await this.deploymentGateway.requestContainerAction(
            serverId,
            safeContainerId,
            action,
          );
          this.logger.log(
            `[CONTAINER_ACTION] agent completed action=${action} containerId=${safeContainerId} serverId=${serverId} success=${result.success}`,
          );
        } catch (error) {
          socketError = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[CONTAINER_ACTION] agent socket failed for server '${serverId}': ${socketError}`,
          );
        }
      }
    } else {
      socketError = `No connected agent for server '${serverId}'`;
      this.logger.warn(
        `[CONTAINER_ACTION] no connected agent for server '${serverId}'`,
      );
    }

    if (!result) {
      this.logger.warn(
        `[CONTAINER_ACTION] using host fallback for ${action} on server '${serverId}'` +
          (socketError ? `: ${socketError}` : ""),
      );
      executedVia = "host";
      try {
        result =
          await this.serverConnectionsService.executeContainerActionOnHost(
            serverId,
            safeContainerId,
            action,
          );
      } catch (error) {
        const hostMessage =
          error instanceof Error ? error.message : String(error);
        const detail = socketError
          ? `Agent: ${socketError}. Host: ${hostMessage}`
          : hostMessage;
        throw new BadRequestException(
          `Failed to ${action} container: ${detail}`,
        );
      }
    }

    if (!result.success) {
      throw new BadRequestException(
        result.error?.trim() ||
          result.stderr?.trim() ||
          `Failed to ${action} container '${safeContainerId}'`,
      );
    }

    const actionPastTense: Record<ContainerActionType, string> = {
      stop: "stopped",
      restart: "restarted",
      delete: "deleted",
    };
    const viaLabel =
      executedVia === "agent"
        ? "via agent"
        : "via server host (agent unavailable or outdated)";
    const message = `Container ${actionPastTense[action]} ${viaLabel}.`;

    return {
      action: result.action,
      containerId: result.containerId,
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      executedVia,
      message,
    };
  }

  /**
   * Starts an on-demand container log stream via the connected agent.
   */
  async startContainerLogs(
    serverId: string,
    userId: string,
    containerId: string,
  ): Promise<ContainerLogsStartResponseDto> {
    await this.assertActiveServerForUser(serverId, userId);
    const safeContainerId = assertValidContainerId(containerId);

    if (!this.deploymentGateway.isAgentConnectedForServer(serverId)) {
      throw new BadRequestException(
        ERROR_MESSAGES.CONTAINER_LOGS.AGENT_UNAVAILABLE,
      );
    }

    const supportsLogs = this.deploymentGateway.agentSupports(
      serverId,
      DeploymentEvents.CONTAINER_LOGS_START,
    );

    if (!supportsLogs) {
      throw new BadRequestException(
        ERROR_MESSAGES.CONTAINER_LOGS.AGENT_UNSUPPORTED,
      );
    }

    try {
      const sessionId = await this.deploymentGateway.requestContainerLogsStart(
        serverId,
        userId,
        safeContainerId,
      );

      return {
        sessionId,
        serverId,
        containerId: safeContainerId,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `${ERROR_MESSAGES.CONTAINER_LOGS.START_FAILED}: ${detail}`,
      );
    }
  }

  /**
   * Stops an active container log stream.
   */
  async stopContainerLogs(
    serverId: string,
    userId: string,
    sessionId: string,
  ): Promise<{ stopped: true; message: string }> {
    await this.assertActiveServerForUser(serverId, userId);

    const trimmedSessionId = sessionId.trim();
    const session =
      this.deploymentGateway.getContainerLogsSession(trimmedSessionId);

    if (
      !session ||
      session.serverId !== serverId ||
      session.userId !== userId
    ) {
      throw new NotFoundException(
        ERROR_MESSAGES.CONTAINER_LOGS.SESSION_NOT_FOUND,
      );
    }

    try {
      this.deploymentGateway.closeContainerLogsSession(trimmedSessionId, {
        notifyAgent: true,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `${ERROR_MESSAGES.CONTAINER_LOGS.STOP_FAILED}: ${detail}`,
      );
    }

    return {
      stopped: true,
      message: CP_SUCCESS_MESSAGES.CONTAINER_LOGS.STOPPED,
    };
  }

  async getDeployment(deploymentId: string): Promise<ServiceDeploymentEntity> {
    const deployment = await this.deploymentRepository.findOne({
      where: { id: deploymentId, deletedAt: IsNull() },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment '${deploymentId}' not found`);
    }

    return deployment;
  }

  async listEnvironmentVariables(
    deploymentId: string,
    options: { maskSecrets?: boolean } = {},
  ): Promise<EnvironmentVariableView[]> {
    await this.getDeployment(deploymentId);

    const rows = await this.environmentVariableRepository.find({
      where: { deploymentId: deploymentId },
      order: { key: "ASC" },
    });

    const { maskSecrets = true } = options;
    const decrypted: Record<string, string> = {};
    for (const row of rows) {
      decrypted[row.key] = this.decryptValue(row.value);
    }

    const display = maskSecrets ? maskEnvMap(decrypted) : decrypted;

    return rows.map((row) => {
      const raw = display[row.key];

      let value: string | null;

      if (raw == null) {
        value = null;
      } else if (typeof raw === "string") {
        value = raw;
      } else if (
        typeof raw === "number" ||
        typeof raw === "boolean" ||
        typeof raw === "bigint"
      ) {
        value = `${raw}`;
      } else {
        value = JSON.stringify(raw);
      }

      return {
        key: row.key,
        value,
        isRequired: row.isRequired,
        isGenerated: row.isGenerated,
        comment: row.comment,
        updatedAt: row.updatedAt,
      };
    });
  }

  async updateEnvironmentVariables(
    deploymentId: string,
    updates: { env?: Record<string, unknown>; ports?: Record<string, unknown> },
  ): Promise<EnvironmentVariableView[]> {
    const deployment = await this.getDeployment(deploymentId);
    const template = await this.templateRepository.findOne({
      where: { slug: deployment.templateSlug },
    });

    if (!template) {
      throw new NotFoundException(
        `Template '${deployment.templateSlug}' not found`,
      );
    }

    const schema: TemplateSchema = {
      env_schema: template.envSchema as Record<string, SchemaFieldDetails>,
      port_schema: template.portSchema as Record<string, SchemaFieldDetails>,
    };
    const portSchemaKeys = Object.keys(schema.port_schema ?? {});

    const stored = await this.loadStoredVariables(deploymentId, portSchemaKeys);
    const mergedEnv = { ...stored.env, ...(updates.env ?? {}) };
    const mergedPorts = { ...stored.ports, ...(updates.ports ?? {}) };

    const composeYaml = this.templatePayloadService.decodeBase64ToYaml(
      template.compose,
    );
    const parsedFromCompose = this.composeParserService.resolveFromCompose({
      compose: composeYaml,
      userEnv: mergedEnv,
      userPorts: mergedPorts,
      portSchemaKeys,
    });

    const normalized = this.templateConfigService.normalizeSchema(schema);
    const { env: validatedEnv, ports: validatedPorts } =
      this.templateConfigService.mergeAndValidate(
        { ...schema, normalized },
        { env: parsedFromCompose.env, ports: parsedFromCompose.ports },
      );

    await this.persistEnvironmentVariables({
      deploymentId,
      env: validatedEnv,
      ports: validatedPorts,
      generatedKeys: [],
      schema,
    });

    return this.listEnvironmentVariables(deploymentId);
  }

  /**
   * Sets deploymentStatus to failed when the control panel could not finish prepare/emit.
   * Agent-reported failures still use WebSocket status updates.
   */
  async markDeploymentFailed(
    deploymentId: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const deployment = await this.deploymentRepository.findOne({
        where: { id: deploymentId, deletedAt: IsNull() },
      });
      if (!deployment) {
        return;
      }

      const terminal: DeploymentStatus[] = [
        "success",
        "removed",
        "cancelled",
        "failed",
      ];
      if (
        terminal.includes(deployment.deploymentStatus) ||
        deployment.deploymentStatus === "removing"
      ) {
        return;
      }

      await this.updateStatus(deploymentId, "failed", {
        message: "Deployment failed",
        error: message,
      });
    } catch (markError) {
      this.logger.warn(
        `Could not mark deployment '${deploymentId}' as failed: ${
          markError instanceof Error ? markError.message : String(markError)
        }`,
      );
    }
  }

  async updateStatus(
    deploymentId: string,
    status: DeploymentStatus,
    options: { message?: string; error?: string } = {},
  ): Promise<void> {
    const deployment = await this.getDeployment(deploymentId);

    deployment.deploymentStatus = status;
    deployment.statusMessage = options.message ?? deployment.statusMessage;
    if (options.error) {
      deployment.lastError = options.error;
    }

    await this.deploymentRepository.save(deployment);
  }

  async loadResolvedForAgent(
    deploymentId: string,
    portSchemaKeys: string[],
  ): Promise<{ env: Record<string, string>; ports: Record<string, number> }> {
    return this.loadStoredVariables(deploymentId, portSchemaKeys);
  }

  private async upsertDeploymentRecord(opts: {
    deploymentId: string;
    templateSlug: string;
    serverId: string;
    userId: string;
    deploymentStatus: DeploymentStatus;
  }): Promise<void> {
    try {
      const existing = await this.deploymentRepository.findOne({
        where: { id: opts.deploymentId },
      });

      if (existing) {
        existing.templateSlug = opts.templateSlug;
        existing.serverId = opts.serverId;
        existing.userId = opts.userId;
        existing.deploymentStatus = opts.deploymentStatus;
        await this.deploymentRepository.save(existing);
        return;
      }

      const deployment = this.deploymentRepository.create({
        id: opts.deploymentId,
        templateSlug: opts.templateSlug,
        serverId: opts.serverId,
        userId: opts.userId,
        deploymentStatus: opts.deploymentStatus,
        statusMessage: null,
        lastError: null,
      });

      await this.deploymentRepository.save(deployment);
    } catch (error) {
      throw new BadRequestException(
        `Failed to persist deployment record: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async persistEnvironmentVariables(opts: {
    deploymentId: string;
    env: Record<string, string>;
    ports: Record<string, number>;
    generatedKeys: string[];
    schema?: TemplateSchema;
    requiredKeys?: Set<string>;
  }): Promise<void> {
    const generated = new Set(opts.generatedKeys);
    const requiredKeys = opts.requiredKeys ?? new Set<string>();

    if (!opts.requiredKeys && opts.schema) {
      for (const field of opts.schema.normalized ??
        this.templateConfigService.normalizeSchema(opts.schema)) {
        if (field.required) {
          requiredKeys.add(field.name);
        }
      }
    }

    const allEntries: Record<string, string> = {
      ...opts.env,
      ...Object.fromEntries(
        Object.entries(opts.ports).map(([key, value]) => [key, String(value)]),
      ),
    };

    for (const [key, value] of Object.entries(allEntries)) {
      const encrypted = this.encryptValue(value);
      const existing = await this.environmentVariableRepository.findOne({
        where: { deploymentId: opts.deploymentId, key },
      });

      if (existing) {
        existing.value = encrypted;
        existing.isRequired = requiredKeys.has(key);
        existing.isGenerated = generated.has(key);
        await this.environmentVariableRepository.save(existing);
        continue;
      }

      const created = this.environmentVariableRepository.create({
        deploymentId: opts.deploymentId,
        key,
        value: encrypted,
        isRequired: requiredKeys.has(key),
        isGenerated: generated.has(key),
        comment: null,
      });
      await this.environmentVariableRepository.save(created);
    }
  }

  private async loadStoredVariables(
    deploymentId: string,
    portSchemaKeys: string[],
  ): Promise<{ env: Record<string, string>; ports: Record<string, number> }> {
    const rows = await this.environmentVariableRepository.find({
      where: { deploymentId: deploymentId },
    });

    const env: Record<string, string> = {};
    const ports: Record<string, number> = {};
    const portKeys = new Set(portSchemaKeys);

    for (const row of rows) {
      const plain = this.decryptValue(row.value);

      if (portKeys.has(row.key) || row.key.startsWith("SERVICE_PORT_")) {
        const parsed = Number(plain);
        if (!Number.isNaN(parsed)) {
          ports[row.key] = parsed;
        }
        continue;
      }

      env[row.key] = plain;
    }

    return { env, ports };
  }

  private encryptValue(value: string): string {
    return this.encryptionService.encrypt(value);
  }

  private decryptValue(encrypted: string): string {
    return this.encryptionService.decrypt(encrypted);
  }

  /**
   * Starts removal of a deployment: marks it removing, notifies agents, and waits for
   * agent confirmation before soft-deleting the DB record (handled in the gateway).
   */
  async removeDeployment(deploymentId: string): Promise<{
    deploymentId: string;
    status: DeploymentStatus;
    message: string;
  }> {
    const deployment = await this.getDeployment(deploymentId);
    const blockingStatuses: DeploymentStatus[] = [
      "pending",
      "validating",
      "pulling",
      "building",
      "deploying",
      "removing",
      "removed",
    ];

    if (blockingStatuses.includes(deployment.deploymentStatus)) {
      throw new ConflictException(
        `Deployment '${deploymentId}' cannot be removed while status is '${deployment.deploymentStatus}'`,
      );
    }

    let serverId = deployment.serverId;
    if (!serverId) {
      if (!deployment.userId) {
        throw new BadRequestException(
          `Deployment '${deploymentId}' has no server_id; cannot remove.`,
        );
      }
      serverId = (
        await this.localServerService.ensureLocalServer(deployment.userId)
      ).id;
    }

    await this.ensureAgentConnectedForServer(serverId);

    await this.updateStatus(deploymentId, "removing", {
      message: SUCCESS_MESSAGES.REMOVING,
    });

    const message: SocketRemoveMessage = {
      type: "REMOVE",
      payload: {
        deploymentId,
        templateSlug: deployment.templateSlug,
      },
    };

    this.deploymentGateway.emitRemove(message, serverId);

    this.logger.log(`Removal requested for deployment '${deploymentId}'`);

    return {
      deploymentId,
      status: "removing",
      message: SUCCESS_MESSAGES.REMOVING,
    };
  }

  /**
   * Soft-deletes a deployment after agent teardown while preserving env vars and history.
   */
  async softDeleteDeploymentRecord(
    deploymentId: string,
    options: { message?: string } = {},
  ): Promise<void> {
    const deployment = await this.deploymentRepository.findOne({
      where: { id: deploymentId },
      withDeleted: true,
    });

    if (!deployment || deployment.deletedAt) {
      return;
    }

    deployment.deploymentStatus = "removed";
    deployment.statusMessage =
      options.message ?? SUCCESS_MESSAGES.REMOVAL_COMPLETED;
    deployment.lastError = null;

    await this.deploymentRepository.softRemove(deployment);

    this.logger.log(`Soft-deleted deployment record '${deploymentId}'`);
  }

  /**
   * Returns true when the deploy request supplies at least one SERVICE_PORT_* value
   * (host publish intent). Used to avoid Traefik mode stripping those keys.
   */
  /**
   * Templates without SERVICE_URL_* cannot use Traefik routing; force direct ports
   * so deploy does not start the proxy stack or skip port binding.
   */
  private resolveUseTraefikForCompose(
    composeYaml: string,
    requested: boolean | undefined,
    templateSlug: string,
  ): boolean | undefined {
    if (!requested) {
      return requested;
    }
    if (!composeYaml.includes("SERVICE_URL_")) {
      this.logger.log(
        `Template '${templateSlug}' has no SERVICE_URL_* — disabling Traefik for this deployment`,
      );
      return false;
    }
    return requested;
  }

  private requestContainsExplicitServiceHostPorts(
    requestPorts: Record<string, unknown>,
    requestEnv: Record<string, unknown>,
  ): boolean {
    const hasServicePortValue = (value: unknown): boolean =>
      value !== undefined && value !== null && value !== "";

    for (const [key, value] of Object.entries(requestPorts)) {
      if (key.startsWith("SERVICE_PORT_") && hasServicePortValue(value)) {
        return true;
      }
    }
    for (const [key, value] of Object.entries(requestEnv)) {
      if (key.startsWith("SERVICE_PORT_") && hasServicePortValue(value)) {
        return true;
      }
    }
    return false;
  }
}
