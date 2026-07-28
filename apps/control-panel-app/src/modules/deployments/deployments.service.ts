import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import dayjs from "dayjs";
import { randomUUID } from "node:crypto";
import { In, IsNull, Not, Repository } from "typeorm";

import {
  ComposeParserService,
  EncryptionService,
  ServerUrlContext,
  SUCCESS_MESSAGES,
  TemplateConfigService,
  TemplatePayloadService,
  buildDeployedComposeYaml,
  maskEnvMap,
  logStructured,
  logStructuredError,
} from "@shared/common";
import {
  ContainerActionResponsePayload,
  ContainerActionType,
  DeploymentEvents,
  DeploymentStatus,
  DeploymentResourceWarning,
  isTerminalDeploymentStatus,
  REMOVAL_BLOCKING_DEPLOYMENT_STATUSES,
  SchemaFieldDetails,
  TemplateSchema,
  SocketDeployMessage,
  SocketRemoveMessage,
} from "@shared/socket-events";

import { SshHealthCheckService, SshConnectionManager } from "@shared/ssh";

import { DeploymentGateway } from "@control-panel/websocket/websocket.gateway";
import { EntityStatus } from "@control-panel/common/entity/entity-status";
import { OperationFailedException } from "@control-panel/common/exceptions/operation-failed.exception";
import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { ServerSshCredentialEntity } from "@control-panel/modules/server-connections/entities/server-ssh-credential.entity";
import { ServerType } from "@control-panel/modules/server-connections/enums/server-type.enum";
import { runSshHealthTestWithTimeout } from "@control-panel/modules/server-connections/utils/run-ssh-health-test.util";
import { mapSshTestErrorCode } from "@control-panel/modules/server-connections/utils/map-ssh-test-error-code.util";
import { LocalServerService } from "@control-panel/modules/server-connections/services/local-server.service";
import { AGENT_INSTALL } from "@control-panel/modules/server-connections/constants/agent-install.constants";
import { ServerConnectionsService } from "@control-panel/modules/server-connections/services/server-connections.service";
import { AgentServerBindingService } from "@control-panel/modules/server-connections/services/agent-server-binding.service";
import { EnvironmentVariableEntity } from "./entities/environment-variable.entity";
import { ServiceDeploymentEntity } from "./entities/service-deployment.entity";
import { ServiceTemplateEntity } from "@control-panel/modules/service-template/entities/service-template.entity";
import {
  BuildServerUrlContextInput,
  PrepareCustomComposeDeploymentInput,
  PrepareDeploymentInput,
  PreparedDeployment,
  ResolveDeploymentServerInput,
  ResolvedDeploymentTarget,
} from "./dto/deployment.types";
import { DEPLOYMENT_MESSAGES } from "./constants/deployment-messages.constants";
import { DeploymentType } from "./enums/deployment-type.enum";
import { CUSTOM_TEMPLATE_SLUG } from "./constants/custom-compose.constants";
import { resolveCustomComposeDeploymentVariables } from "./utils/custom-compose-env.util";
import {
  encodeComposeYamlToPayload,
  getCustomComposeDisplayNameValidationError,
  normalizeCustomComposeDisplayName,
  validateUploadedCustomCompose,
  type CustomComposeValidationResult,
} from "./utils/custom-compose.util";
import { normalizeServerHostForUrls } from "./utils/deployment-server.util";
import type { ContainerActionResponseDto } from "./dto/container-action-response.dto";
import type { ContainerLogsStartResponseDto } from "./dto/container-logs.dto";
import type { ServerContainerDto } from "./dto/server-container.dto";
import {
  mergeDiscoveredContainersWithDeployments,
  normalizeDockerContainerName,
  sanitizeDeploymentProjectName,
} from "./utils/container-discovery.util";
import {
  containerActionActivityFailedMessage,
  containerActionActivityStartedMessage,
  containerActionActivitySuccessMessage,
  containerActionActivityTitle,
  containerLogsActivityTitle,
  resolveActivityContainerLabel,
} from "./utils/container-activity-copy.util";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES as CP_SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { assertValidContainerId } from "./utils/container-action.util";
import { ActivityService } from "../activity/services/activity.service";
import { ActivityType } from "../activity/enums/activity-type.enum";
import type { EnvironmentVariableView } from "./interfaces/deployments.interface";

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);
  private readonly containerLogActivities = new Map<string, string>();

  constructor(
    @InjectRepository(ServiceDeploymentEntity)
    private readonly deploymentRepository: Repository<ServiceDeploymentEntity>,
    @InjectRepository(EnvironmentVariableEntity)
    private readonly environmentVariableRepository: Repository<EnvironmentVariableEntity>,
    @InjectRepository(ServiceTemplateEntity)
    private readonly templateRepository: Repository<ServiceTemplateEntity>,
    @InjectRepository(ServerSshCredentialEntity)
    private readonly serverCredentialRepository: Repository<ServerSshCredentialEntity>,
    private readonly serverConnectionsService: ServerConnectionsService,
    private readonly agentServerBinding: AgentServerBindingService,
    private readonly localServerService: LocalServerService,
    private readonly templatePayloadService: TemplatePayloadService,
    private readonly templateConfigService: TemplateConfigService,
    private readonly composeParserService: ComposeParserService,
    private readonly encryptionService: EncryptionService,
    private readonly sshHealthCheck: SshHealthCheckService,
    private readonly sshConnectionManager: SshConnectionManager,
    private readonly activityService: ActivityService,
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

      logStructured(
        this.logger,
        "log",
        "deployment.agent_availability",
        "started",
        {
          module: "DeploymentsService",
          serverId,
          deploymentId: options?.deploymentId,
          reason: "no_agent_websocket",
        },
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
    options?: { skipResourceValidation?: boolean },
  ): Promise<{
    message: string;
    template: string;
    deploymentId: string;
    serverId: string;
  }> {
    try {
      await this.updateStatus(
        prepared.deploymentId,
        DeploymentStatus.DEPLOYING,
        {
          message: "Deploying to agent",
        },
      );

      this.logger.debug(
        `[emitPreparedDeployment] deploymentId=${prepared.deploymentId} serverId=${prepared.serverId} portCount=${Object.keys(prepared.mergedPorts).length}`,
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
          skipResourceValidation: options?.skipResourceValidation,
        },
      };

      await this.ensureAgentConnectedForServer(prepared.serverId, {
        deploymentId: prepared.deploymentId,
      });
      logStructured(this.logger, "log", "deployment.send_to_agent", "started", {
        module: "DeploymentsService",
        deploymentId: prepared.deploymentId,
        serverId: prepared.serverId,
        template: prepared.templateSlug,
      });
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
   * Starts activity tracking, then emits install + deploy to the agent.
   *
   * Emit failures are logged and swallowed so the caller still receives the
   * deployment id for log subscription; status updates reflect the failure.
   */
  async schedulePreparedDeployment(
    prepared: PreparedDeployment,
    isRedeploy: boolean,
    options?: { skipResourceValidation?: boolean },
  ): Promise<{
    message: string;
    template: string;
    deploymentId: string;
    serverId: string;
  }> {
    await this.startDeploymentActivity(prepared, isRedeploy);

    try {
      await this.emitPreparedDeployment(prepared, isRedeploy, options);
    } catch (error: unknown) {
      logStructuredError(this.logger, "deployment.background_emit", error, {
        module: "DeploymentsService",
        deploymentId: prepared.deploymentId,
        serverId: prepared.serverId,
      });
    }

    return {
      message: isRedeploy ? "Redeployment started" : "Deployment started",
      template: prepared.templateSlug,
      deploymentId: prepared.deploymentId,
      serverId: prepared.serverId,
    };
  }

  /**
   * Creates the Activity row that tracks this deploy from start through completion.
   *
   * Failures are swallowed so activity tracking never blocks a deployment start.
   *
   * @param prepared - Prepared deployment payload (ids, slug, ownership).
   * @param isRedeploy - True when this is a redeploy of an existing deployment.
   */
  private async startDeploymentActivity(
    prepared: PreparedDeployment,
    isRedeploy: boolean,
  ): Promise<void> {
    await this.activityService.recordActivity({
      userId: prepared.userId,
      serverId: prepared.serverId,
      deploymentId: prepared.deploymentId,
      templateSlug: prepared.templateSlug,
      type: ActivityType.DEPLOYMENT,
      title: isRedeploy
        ? `Redeploy ${prepared.templateSlug}`
        : `Deploy ${prepared.templateSlug}`,
      operationStatus: DeploymentStatus.PENDING,
      message: isRedeploy ? "Redeployment started" : "Deployment started",
    });
  }

  /**
   * Verifies RAM, ports, and CPU on the target agent before starting deployment.
   *
   * API contract is unchanged: returns `{ available: true }`, `{ available: false, warning }`
   * for overridable RAM/CPU warnings, or throws for hard failures (e.g. port in use).
   * is recorded (best-effort; never changes the HTTP outcome).
   *
   * @param input - User, server target, template slug, and optional env/ports/Traefik flags.
   * @returns Availability result for the console confirm/continue flow.
   */
  async validateBeforeDeploy(input: {
    userId: string;
    serverId?: string;
    deployOnLocal?: boolean;
    templateSlug: string;
    requestEnv?: Record<string, unknown>;
    requestPorts?: Record<string, unknown>;
    useTraefikRequest?: boolean;
  }): Promise<
    | { available: true }
    | { available: false; warning: DeploymentResourceWarning }
  > {
    const { serverId, userId } = await this.resolveDeploymentTarget({
      userId: input.userId,
      serverId: input.serverId,
      deployOnLocal: input.deployOnLocal,
    });

    const server = await this.assertActiveServerForUser(serverId, userId);

    if (server.serverType !== ServerType.LOCAL) {
      const credential = await this.serverCredentialRepository.findOne({
        where: {
          serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      if (!credential) {
        throw new NotFoundException(
          ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
        );
      }

      const sshResult = await runSshHealthTestWithTimeout(this.sshHealthCheck, {
        serverId: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        authType: credential.authType,
        encryptedPassword: credential.encryptedPassword ?? null,
        encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
        privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
      });

      if (!sshResult.success) {
        this.sshConnectionManager.disconnect(server.id);
        throw new OperationFailedException(
          ERROR_MESSAGES.SERVER.SSH_CONNECTION_FAILED,
          sshResult.message || ERROR_MESSAGES.SERVER.SSH_TEST_FAILED,
          HttpStatus.BAD_REQUEST,
          {
            errorCode: sshResult.code ?? mapSshTestErrorCode(sshResult.message),
          },
        );
      }

      this.sshConnectionManager.disconnect(server.id);
    }

    if (!this.deploymentGateway.isAgentConnectedForServer(serverId)) {
      const agentInstalled =
        await this.serverConnectionsService.isAgentInstalledOnServer(serverId);

      if (!agentInstalled) {
        logStructured(this.logger, "log", "deployment.validation", "skipped", {
          module: "DeploymentsService",
          serverId,
          reason: "agent_not_installed",
        });
        return { available: true };
      }

      logStructured(this.logger, "log", "deployment.validation", "started", {
        module: "DeploymentsService",
        serverId,
        reason: "agent_installed_awaiting_connection",
      });
      await this.waitForAgentConnection(serverId);

      if (!this.deploymentGateway.isAgentConnectedForServer(serverId)) {
        throw new ConflictException(
          `Agent is installed on server '${serverId}' but is not connected. Cannot validate deployment resources.`,
        );
      }
    }

    const serverUrlContext = await this.buildServerUrlContext({
      userId,
      serverId,
      useTraefikRequest: input.useTraefikRequest,
      requestEnv: input.requestEnv,
      requestPorts: input.requestPorts,
    });

    const prepared = await this.prepareDeployment({
      templateSlug: input.templateSlug,
      serverId,
      userId,
      requestEnv: input.requestEnv,
      requestPorts: input.requestPorts,
      serverUrlContext,
      persist: false,
    });

    const encryptedCompose = this.encryptionService.encrypt(
      prepared.encodedCompose,
    );
    const encryptedEnv = this.encryptionService.encrypt(
      JSON.stringify(prepared.mergedEnv),
    );
    const encryptedPorts = this.encryptionService.encrypt(
      JSON.stringify(prepared.mergedPorts),
    );

    const result = await this.deploymentGateway.requestDeploymentValidate(
      serverId,
      {
        requestId: randomUUID(),
        templateSlug: prepared.templateSlug,
        compose: encryptedCompose,
        env: encryptedEnv,
        ports: encryptedPorts,
        schema: prepared.schema,
        composeOnly: prepared.composeOnly,
        useTraefik: prepared.useTraefik,
      },
    );

    if (!result.available) {
      const reason =
        result.warning?.message?.trim() ||
        result.error?.trim() ||
        "Deployment validation failed";

      await this.activityService.recordActivity({
        userId,
        serverId,
        type: ActivityType.DEPLOYMENT_VALIDATION_STOPPED,
        title: `Deploy blocked · ${input.templateSlug}`,
        message: `Resource validation stopped deployment: ${reason}`,
        templateSlug: input.templateSlug,
        operationStatus: DeploymentStatus.FAILED,
      });

      if (result.warning) {
        return { available: false, warning: result.warning };
      }

      throw new ConflictException(reason);
    }

    return { available: true };
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
    const deploymentId = existingDeploymentId ?? this.generateDeploymentId();
    const shouldPersist = input.persist !== false;

    if (shouldPersist) {
      await this.upsertDeploymentRecord({
        deploymentId,
        templateSlug,
        serviceTemplateId: template.id,
        serverId,
        userId,
        deploymentStatus: DeploymentStatus.PENDING,
      });
      await this.updateStatus(deploymentId, DeploymentStatus.VALIDATING, {
        message: "Validating deployment configuration",
      });
    }

    try {
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

      if (shouldPersist) {
        await this.persistEnvironmentVariables({
          deploymentId,
          env: mergedEnv,
          ports: mergedPorts,
          generatedKeys: parsedFromCompose.generatedKeys,
          schema,
        });
        await this.persistEncryptedDeployedCompose(
          deploymentId,
          composeYaml,
          mergedEnv,
          mergedPorts,
        );
        await this.updateStatus(deploymentId, DeploymentStatus.PENDING, {
          message: "Deployment prepared",
        });

        if (parsedFromCompose.generatedKeys.length > 0) {
          this.logger.log(
            `Stored auto-generated variables for '${deploymentId}': ${parsedFromCompose.generatedKeys.join(", ")}`,
          );
        }
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
    } catch (error) {
      if (shouldPersist) {
        await this.markDeploymentFailed(deploymentId, error);
      }
      throw error;
    }
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
    const shouldPersist = input.persist !== false;
    const serverUrlContext: ServerUrlContext | undefined = serverUrlContextInput
      ? { ...serverUrlContextInput, deploymentId }
      : undefined;

    if (shouldPersist) {
      await this.upsertDeploymentRecord({
        deploymentId,
        templateSlug,
        serviceTemplateId: template.id,
        serverId,
        userId,
        deploymentStatus: DeploymentStatus.PENDING,
      });
      await this.updateStatus(deploymentId, DeploymentStatus.VALIDATING, {
        message: "Validating deployment configuration",
      });
    }

    try {
      let baseEnv: Record<string, unknown> = { ...requestEnv };
      let basePorts: Record<string, unknown> = { ...requestPorts };

      if (existingDeploymentId) {
        const stored = await this.loadStoredVariables(existingDeploymentId, []);
        baseEnv = { ...stored.env, ...requestEnv };
        basePorts = { ...stored.ports, ...requestPorts };
        this.logger.debug(
          `[prepareComposeDeployment] merged redeploy ports deploymentId=${deploymentId} portCount=${Object.keys(basePorts).length}`,
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
        const expected =
          this.composeParserService.listPortVariables(composeYaml);
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
        if (
          basePorts[portVar] === undefined &&
          baseEnv[portVar] === undefined
        ) {
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

      if (shouldPersist) {
        await this.persistEnvironmentVariables({
          deploymentId,
          env: mergedEnv,
          ports: mergedPorts,
          generatedKeys: parsedFromCompose.generatedKeys,
          requiredKeys,
        });
        await this.persistEncryptedDeployedCompose(
          deploymentId,
          composeYaml,
          mergedEnv,
          mergedPorts,
        );
        await this.updateStatus(deploymentId, DeploymentStatus.PENDING, {
          message: "Deployment prepared",
        });

        if (parsedFromCompose.generatedKeys.length > 0) {
          this.logger.log(
            `Stored auto-generated variables for '${deploymentId}': ${parsedFromCompose.generatedKeys.join(", ")}`,
          );
        }
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
    } catch (error) {
      if (shouldPersist) {
        await this.markDeploymentFailed(deploymentId, error);
      }
      throw error;
    }
  }

  /**
   * Validates user-uploaded Docker Compose YAML and returns extracted variables.
   * Does not persist compose content or create deployment records.
   */
  validateCustomComposeUpload(
    composeYaml: string,
  ): CustomComposeValidationResult {
    try {
      return validateUploadedCustomCompose(composeYaml);
    } catch (error) {
      throw new BadRequestException(
        `Failed to validate compose file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Prepares a custom Docker Compose deployment using uploaded YAML instead of a
   * marketplace template. Encrypts compose content at rest and reuses compose-only
   * env/port resolution from {@link prepareComposeDeployment}.
   */
  async prepareCustomComposeDeployment(
    input: PrepareCustomComposeDeploymentInput,
  ): Promise<PreparedDeployment> {
    try {
      const {
        composeYaml,
        displayName: rawDisplayName,
        serverId,
        userId,
        requestEnv = {},
        requestPorts = {},
        existingDeploymentId,
        serverUrlContext: serverUrlContextInput,
      } = input;

      const displayNameError =
        getCustomComposeDisplayNameValidationError(rawDisplayName);
      if (displayNameError) {
        throw new BadRequestException(displayNameError);
      }

      const displayName = normalizeCustomComposeDisplayName(rawDisplayName);
      const templateSlug = CUSTOM_TEMPLATE_SLUG;

      const customTemplate = await this.templateRepository.findOne({
        where: { slug: CUSTOM_TEMPLATE_SLUG },
      });
      if (!customTemplate) {
        throw new NotFoundException(
          `Custom template '${CUSTOM_TEMPLATE_SLUG}' not found`,
        );
      }

      const validation = validateUploadedCustomCompose(composeYaml);
      if (!validation.valid) {
        const summary = validation.issues
          .slice(0, 3)
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ");
        throw new BadRequestException(summary || "Invalid Docker Compose file");
      }

      let encodedCompose: string;
      try {
        encodedCompose = encodeComposeYamlToPayload(validation.composeYaml);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : String(error),
        );
      }

      const deploymentId = existingDeploymentId ?? this.generateDeploymentId();
      const shouldPersist = input.persist !== false;
      const serverUrlContext: ServerUrlContext | undefined =
        serverUrlContextInput
          ? { ...serverUrlContextInput, deploymentId }
          : undefined;

      if (shouldPersist) {
        await this.upsertDeploymentRecord({
          deploymentId,
          templateSlug,
          serviceTemplateId: customTemplate.id,
          displayName,
          serverId,
          userId,
          deploymentStatus: DeploymentStatus.PENDING,
          deploymentType: DeploymentType.CUSTOM_SERVICE,
        });
        await this.updateStatus(deploymentId, DeploymentStatus.VALIDATING, {
          message: "Validating deployment configuration",
        });
      }

      try {
        let baseEnv: Record<string, unknown> = { ...requestEnv };
        let basePorts: Record<string, unknown> = { ...requestPorts };

        if (existingDeploymentId) {
          const stored = await this.loadStoredVariables(
            existingDeploymentId,
            [],
          );
          baseEnv = { ...stored.env, ...requestEnv };
          basePorts = { ...stored.ports, ...requestPorts };
        }

        const customResolved = resolveCustomComposeDeploymentVariables(
          validation.composeYaml,
          baseEnv,
          basePorts,
        );

        const declaredPortVars = this.composeParserService.listPortVariables(
          validation.composeYaml,
        );
        if (declaredPortVars.length > 0) {
          const unknownPortKeys = this.composeParserService.findUnknownPortKeys(
            validation.composeYaml,
            requestPorts,
          );
          if (unknownPortKeys.length > 0) {
            throw new BadRequestException(
              `Unknown port keys: ${unknownPortKeys.join(", ")}. Expected: ${declaredPortVars.join(", ")}`,
            );
          }
        }

        let parsedFromCompose;
        try {
          parsedFromCompose = this.composeParserService.resolveFromCompose({
            compose: validation.composeYaml,
            userEnv: customResolved.env,
            userPorts: customResolved.ports,
            serverUrlContext,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new BadRequestException(
            `Failed to resolve custom compose variables: ${message}`,
          );
        }

        const mergedEnv = parsedFromCompose.env;
        const mergedPorts = parsedFromCompose.ports;
        const requiredKeys = customResolved.requiredKeys;

        if (shouldPersist) {
          await this.persistEnvironmentVariables({
            deploymentId,
            env: mergedEnv,
            ports: mergedPorts,
            generatedKeys: parsedFromCompose.generatedKeys,
            requiredKeys,
          });
          await this.persistEncryptedDeployedCompose(
            deploymentId,
            validation.composeYaml,
            mergedEnv,
            mergedPorts,
          );
          await this.updateStatus(deploymentId, DeploymentStatus.PENDING, {
            message: "Deployment prepared",
          });

          if (parsedFromCompose.generatedKeys.length > 0) {
            this.logger.log(
              `Stored auto-generated variables for '${deploymentId}': ${parsedFromCompose.generatedKeys.join(", ")}`,
            );
          }
        }

        const useTraefik = this.resolveUseTraefikForCompose(
          validation.composeYaml,
          serverUrlContext?.useTraefik,
          templateSlug,
        );

        return {
          deploymentId,
          serverId,
          userId,
          templateSlug,
          encodedCompose,
          mergedEnv,
          mergedPorts,
          generatedKeys: parsedFromCompose.generatedKeys,
          composeOnly: true,
          useTraefik,
        };
      } catch (error) {
        if (shouldPersist) {
          await this.markDeploymentFailed(deploymentId, error);
        }
        throw error;
      }
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to prepare custom compose deployment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Verifies agent resources for a custom compose deployment before deploy.
   * Reuses the standard validation socket flow with uploaded compose content.
   */
  async validateCustomComposeBeforeDeploy(input: {
    userId: string;
    serverId?: string;
    deployOnLocal?: boolean;
    composeYaml: string;
    displayName: string;
    requestEnv?: Record<string, unknown>;
    requestPorts?: Record<string, unknown>;
    useTraefikRequest?: boolean;
  }): Promise<
    | { available: true }
    | { available: false; warning: DeploymentResourceWarning }
  > {
    try {
      const { serverId, userId } = await this.resolveDeploymentTarget({
        userId: input.userId,
        serverId: input.serverId,
        deployOnLocal: input.deployOnLocal,
      });

      const server = await this.assertActiveServerForUser(serverId, userId);

      if (server.serverType !== ServerType.LOCAL) {
        const credential = await this.serverCredentialRepository.findOne({
          where: {
            serverId,
            status: EntityStatus.ACTIVE,
            deletedAt: IsNull(),
          },
        });

        if (!credential) {
          throw new NotFoundException(
            ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
          );
        }

        const sshResult = await runSshHealthTestWithTimeout(
          this.sshHealthCheck,
          {
            serverId: server.id,
            host: server.host,
            port: server.port,
            username: server.username,
            authType: credential.authType,
            encryptedPassword: credential.encryptedPassword ?? null,
            encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
            privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
          },
        );

        if (!sshResult.success) {
          this.sshConnectionManager.disconnect(server.id);
          throw new OperationFailedException(
            ERROR_MESSAGES.SERVER.SSH_CONNECTION_FAILED,
            sshResult.message || ERROR_MESSAGES.SERVER.SSH_TEST_FAILED,
            HttpStatus.BAD_REQUEST,
            {
              errorCode:
                sshResult.code ?? mapSshTestErrorCode(sshResult.message),
            },
          );
        }

        this.sshConnectionManager.disconnect(server.id);
      }

      if (!this.deploymentGateway.isAgentConnectedForServer(serverId)) {
        const agentInstalled =
          await this.serverConnectionsService.isAgentInstalledOnServer(
            serverId,
          );

        if (!agentInstalled) {
          return { available: true };
        }

        await this.waitForAgentConnection(serverId);

        if (!this.deploymentGateway.isAgentConnectedForServer(serverId)) {
          throw new ConflictException(
            `Agent is installed on server '${serverId}' but is not connected. Cannot validate deployment resources.`,
          );
        }
      }

      const serverUrlContext = await this.buildServerUrlContext({
        userId,
        serverId,
        useTraefikRequest: input.useTraefikRequest,
        requestEnv: input.requestEnv,
        requestPorts: input.requestPorts,
      });

      const prepared = await this.prepareCustomComposeDeployment({
        composeYaml: input.composeYaml,
        displayName: input.displayName,
        serverId,
        userId,
        requestEnv: input.requestEnv,
        requestPorts: input.requestPorts,
        serverUrlContext,
        persist: false,
      });

      const encryptedCompose = this.encryptionService.encrypt(
        prepared.encodedCompose,
      );
      const encryptedEnv = this.encryptionService.encrypt(
        JSON.stringify(prepared.mergedEnv),
      );
      const encryptedPorts = this.encryptionService.encrypt(
        JSON.stringify(prepared.mergedPorts),
      );

      const result = await this.deploymentGateway
        .requestDeploymentValidate(serverId, {
          requestId: randomUUID(),
          templateSlug: prepared.templateSlug,
          compose: encryptedCompose,
          env: encryptedEnv,
          ports: encryptedPorts,
          composeOnly: prepared.composeOnly,
          useTraefik: prepared.useTraefik,
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "Deployment resource validation failed";
          throw new ConflictException(message);
        });

      if (!result.available) {
        const reason =
          result.warning?.message?.trim() ||
          result.error?.trim() ||
          "Deployment validation failed";

        await this.activityService.recordActivity({
          userId,
          serverId,
          type: ActivityType.DEPLOYMENT_VALIDATION_STOPPED,
          title: `Deploy blocked · ${prepared.templateSlug}`,
          message: `Resource validation stopped deployment: ${reason}`,
          templateSlug: prepared.templateSlug,
          operationStatus: DeploymentStatus.FAILED,
        });

        if (result.warning) {
          return { available: false, warning: result.warning };
        }

        throw new ConflictException(reason);
      }

      return { available: true };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof OperationFailedException
      ) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to validate custom compose resources: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private static readonly OVERVIEW_EXCLUDED_STATUSES: DeploymentStatus[] = [
    DeploymentStatus.FAILED,
    DeploymentStatus.PENDING,
    DeploymentStatus.VALIDATING,
    DeploymentStatus.PULLING,
    DeploymentStatus.BUILDING,
    DeploymentStatus.DEPLOYING,
    DeploymentStatus.CANCELLED,
    DeploymentStatus.REMOVING,
    DeploymentStatus.REMOVED,
  ];

  /**
   * Lists runtime containers on a server merged with Kubeara deployment records.
   * On shared hosts, matches any platform deployment on that host for name/logo.
   * Offline stubs remain limited to the viewing user's own deployments.
   */
  async listServerContainers(
    serverId: string,
    userId: string,
  ): Promise<ServerContainerDto[]> {
    try {
      const server = await this.assertActiveServerForUser(serverId, userId);

      const discovered =
        await this.serverConnectionsService.discoverContainers(serverId);

      const hostServerIds =
        await this.agentServerBinding.listActiveServerIdsForHost(server.host);
      const matchServerIds =
        hostServerIds.length > 0 ? hostServerIds : [serverId];

      const deploymentRows = await this.deploymentRepository.find({
        where: {
          serverId: In(matchServerIds),
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
        serviceName: this.resolveDeploymentServiceName(deployment),
        composeProject: sanitizeDeploymentProjectName(deployment.id),
        ownerServerId: deployment.serverId ?? serverId,
      }));

      return mergeDiscoveredContainersWithDeployments(
        discovered,
        deployments,
        serverId,
      );
    } catch (error) {
      this.logger.error(
        `List server containers failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Executes a container lifecycle action via the connected agent, with host SSH/local fallback.
   *
   * Activity tracking is best-effort ({@link ActivityService.tryStartActivity}) so a
   * missing activities table or insert failure cannot block start/stop/restart/delete.
   *
   * @param serverId - Target server id.
   * @param userId - Authenticated user id.
   * @param containerId - Docker container id.
   * @param action - Lifecycle action to run.
   * @param options - Optional deploymentId link and containerName for activity copy.
   * @returns Action result DTO (stdout/stderr/exitCode/executedVia).
   */
  async executeContainerAction(
    serverId: string,
    userId: string,
    containerId: string,
    action: ContainerActionType,
    options: {
      deploymentId?: string | null;
      containerName?: string | null;
    } = {},
  ): Promise<ContainerActionResponseDto> {
    let activityId: string | null = null;
    let containerLabel = resolveActivityContainerLabel(
      containerId,
      options.containerName,
    );

    try {
      await this.assertActiveServerForUser(serverId, userId);
      const safeContainerId = assertValidContainerId(containerId);
      containerLabel = await this.resolveContainerLabel(
        serverId,
        safeContainerId,
        options.containerName,
      );

      const startedId = await this.activityService.tryStartActivity({
        userId,
        serverId,
        type: this.activityService.containerActionType(action),
        title: containerActionActivityTitle(action, containerLabel),
        deploymentId: options.deploymentId?.trim() || null,
        operationStatus: DeploymentStatus.RUNNING,
        message: containerActionActivityStartedMessage(action, containerLabel),
      });
      activityId = startedId;

      let linkedDeploymentId: string | null = null;
      if (action === "delete") {
        const trimmedDeploymentId = options.deploymentId?.trim();
        if (trimmedDeploymentId) {
          const deployment = await this.deploymentRepository.findOne({
            where: {
              id: trimmedDeploymentId,
              serverId,
              deletedAt: IsNull(),
            },
          });
          linkedDeploymentId = deployment?.id ?? null;
        } else {
          const discovered =
            await this.serverConnectionsService.discoverContainers(serverId);
          const queryId = safeContainerId.toLowerCase();
          const targetContainer = discovered.find((container) => {
            const id = container.containerId.trim().toLowerCase();
            return (
              id === queryId || id.startsWith(queryId) || queryId.startsWith(id)
            );
          });
          const containerName = targetContainer?.containerName
            ? normalizeDockerContainerName(targetContainer.containerName)
            : "";
          if (
            containerName.toLowerCase() ===
            AGENT_INSTALL.CONTAINER_NAME.toLowerCase()
          ) {
            throw new BadRequestException(
              ERROR_MESSAGES.CONTAINER.KUBEARA_AGENT_DELETE_FORBIDDEN,
            );
          }
        }
      }

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

        logStructured(this.logger, "log", "container.action", "started", {
          module: "DeploymentsService",
          serverId,
          action,
          containerId: safeContainerId,
          agentVersion,
          supportsContainerAction,
        });

        if (!supportsContainerAction) {
          socketError = `Connected agent (version ${agentVersion}) does not support container actions — rebuild or update the agent image to include the container:action handler`;
          logStructured(this.logger, "warn", "container.action", "skipped", {
            module: "DeploymentsService",
            serverId,
            reason: socketError,
          });
        } else {
          try {
            result = await this.deploymentGateway.requestContainerAction(
              serverId,
              safeContainerId,
              action,
            );
            logStructured(this.logger, "log", "container.action", "succeeded", {
              module: "DeploymentsService",
              serverId,
              action,
              containerId: safeContainerId,
              success: result.success,
            });
          } catch (error) {
            socketError =
              error instanceof Error ? error.message : String(error);
            logStructured(this.logger, "warn", "container.action", "failed", {
              module: "DeploymentsService",
              serverId,
              action,
              containerId: safeContainerId,
              error: socketError,
            });
          }
        }
      } else {
        socketError = `No connected agent for server '${serverId}'`;
        logStructured(this.logger, "warn", "container.action", "failed", {
          module: "DeploymentsService",
          serverId,
          error: socketError,
        });
      }

      if (!result) {
        logStructured(this.logger, "warn", "container.action", "retry", {
          module: "DeploymentsService",
          serverId,
          action,
          containerId: safeContainerId,
          reason: socketError ?? "agent_unavailable",
        });
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

      if (action === "delete" && linkedDeploymentId) {
        await this.softDeleteDeploymentRecord(linkedDeploymentId, {
          message: DEPLOYMENT_MESSAGES.CONTAINER_DELETED,
        });
      }

      const message = containerActionActivitySuccessMessage(
        action,
        containerLabel,
        executedVia,
      );

      if (activityId) {
        await this.activityService.updateActivityStatus(activityId, {
          operationStatus: DeploymentStatus.SUCCESS,
          message,
        });
      }

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
    } catch (error) {
      if (activityId) {
        await this.activityService.updateActivityStatus(activityId, {
          operationStatus: DeploymentStatus.FAILED,
          message: containerActionActivityFailedMessage(
            action,
            containerLabel,
            toErrorMessage(error),
          ),
        });
      }
      this.logger.error(
        `Container action '${action}' failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Starts an on-demand container log stream via the connected agent.
   */
  /**
   * Starts an on-demand container log stream via the connected agent.
   *
   * Activity tracking is best-effort so log streaming still works if activity
   * persistence fails.
   *
   * @param serverId - Target server id.
   * @param userId - Authenticated user id.
   * @param containerId - Docker container id.
   * @param options - Optional containerName for activity copy.
   * @returns Session id payload for the console to subscribe on the socket.
   */
  async startContainerLogs(
    serverId: string,
    userId: string,
    containerId: string,
    options: { containerName?: string | null } = {},
  ): Promise<ContainerLogsStartResponseDto> {
    let activityId: string | null = null;
    let containerLabel = resolveActivityContainerLabel(
      containerId,
      options.containerName,
    );

    try {
      await this.assertActiveServerForUser(serverId, userId);
      const safeContainerId = assertValidContainerId(containerId);
      containerLabel = await this.resolveContainerLabel(
        serverId,
        safeContainerId,
        options.containerName,
      );

      const activityIdStarted = await this.activityService.tryStartActivity({
        userId,
        serverId,
        type: ActivityType.CONTAINER_LOGS,
        title: containerLogsActivityTitle(containerLabel),
        operationStatus: DeploymentStatus.RUNNING,
        message: `Streaming logs for ${containerLabel}`,
      });
      activityId = activityIdStarted;

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
        const sessionId =
          await this.deploymentGateway.requestContainerLogsStart(
            serverId,
            userId,
            safeContainerId,
          );

        if (activityId) {
          this.containerLogActivities.set(sessionId, activityId);
        }

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
    } catch (error) {
      if (activityId) {
        await this.activityService.updateActivityStatus(activityId, {
          operationStatus: DeploymentStatus.FAILED,
          message: `Failed to stream logs for ${containerLabel}: ${toErrorMessage(error)}`,
        });
      }
      this.logger.error(
        `Failed to start container logs for server '${serverId}': ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
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
    try {
      await this.assertActiveServerForUser(serverId, userId);

      const trimmedSessionId = sessionId.trim();
      const session =
        this.deploymentGateway.getContainerLogsSession(trimmedSessionId);

      if (
        session &&
        (session.serverId !== serverId || session.userId !== userId)
      ) {
        throw new NotFoundException(
          ERROR_MESSAGES.CONTAINER_LOGS.SESSION_NOT_FOUND,
        );
      }

      if (!session) {
        this.deploymentGateway.notifyAgentContainerLogsStop(
          serverId,
          trimmedSessionId,
        );
        const orphanActivityId =
          this.containerLogActivities.get(trimmedSessionId);
        if (orphanActivityId) {
          this.containerLogActivities.delete(trimmedSessionId);
          await this.activityService.updateActivityStatus(orphanActivityId, {
            operationStatus: DeploymentStatus.SUCCESS,
            message: CP_SUCCESS_MESSAGES.CONTAINER_LOGS.STOPPED,
          });
        }
        return {
          stopped: true,
          message: CP_SUCCESS_MESSAGES.CONTAINER_LOGS.STOPPED,
        };
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

      const activityId = this.containerLogActivities.get(trimmedSessionId);
      if (activityId) {
        this.containerLogActivities.delete(trimmedSessionId);
        await this.activityService.updateActivityStatus(activityId, {
          operationStatus: DeploymentStatus.SUCCESS,
          message: CP_SUCCESS_MESSAGES.CONTAINER_LOGS.STOPPED,
        });
      }

      return {
        stopped: true,
        message: CP_SUCCESS_MESSAGES.CONTAINER_LOGS.STOPPED,
      };
    } catch (error) {
      this.logger.error(
        `Failed to stop container logs for server '${serverId}': ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async getDeployment(deploymentId: string): Promise<ServiceDeploymentEntity> {
    try {
      const deployment = await this.deploymentRepository.findOne({
        where: { id: deploymentId, deletedAt: IsNull() },
      });

      if (!deployment) {
        throw new NotFoundException(`Deployment '${deploymentId}' not found`);
      }

      return deployment;
    } catch (error) {
      this.logger.error(
        `Get deployment '${deploymentId}' failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Returns the most recently updated deployment for a service on a server.
   * @param input - The input object containing the user ID, server ID, and template slug.
   * @returns The latest deployment for the server and template.
   */
  async getLatestDeploymentForServerAndTemplate(input: {
    userId: string;
    serverId: string;
    templateSlug: string;
  }): Promise<ServiceDeploymentEntity> {
    try {
      const [deployment] = await this.deploymentRepository.find({
        where: {
          userId: input.userId,
          serverId: input.serverId,
          templateSlug: input.templateSlug,
          deletedAt: IsNull(),
        },
        order: { updatedAt: "DESC" },
        take: 1,
      });

      if (!deployment) {
        throw new NotFoundException(
          `No deployment found for '${input.templateSlug}' on server '${input.serverId}'`,
        );
      }

      return deployment;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Get latest deployment for '${input.templateSlug}' on server '${input.serverId}' failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async listEnvironmentVariables(
    deploymentId: string,
    options: { maskSecrets?: boolean } = {},
  ): Promise<EnvironmentVariableView[]> {
    try {
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
    } catch (error) {
      this.logger.error(
        `List environment variables failed for deployment '${deploymentId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async updateEnvironmentVariables(
    deploymentId: string,
    updates: { env?: Record<string, unknown>; ports?: Record<string, unknown> },
  ): Promise<EnvironmentVariableView[]> {
    try {
      const deployment = await this.getDeployment(deploymentId);

      if (deployment.deploymentType === DeploymentType.CUSTOM_SERVICE) {
        throw new BadRequestException(
          "Environment variables for custom compose deployments cannot be edited. Re-upload the compose file to change them.",
        );
      }

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

      const stored = await this.loadStoredVariables(
        deploymentId,
        portSchemaKeys,
      );
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

      await this.persistEncryptedDeployedCompose(
        deploymentId,
        composeYaml,
        validatedEnv,
        validatedPorts,
      );

      return this.listEnvironmentVariables(deploymentId);
    } catch (error) {
      this.logger.error(
        `Update environment variables failed for deployment '${deploymentId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
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

      if (
        isTerminalDeploymentStatus(deployment.deploymentStatus) ||
        deployment.deploymentStatus === DeploymentStatus.REMOVING
      ) {
        return;
      }

      const isResource = this.isResourceValidationFailure(message, message);
      await this.updateStatus(deploymentId, DeploymentStatus.FAILED, {
        message: isResource
          ? "Resource validation stopped deployment"
          : "Deployment failed",
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

  /**
   * Persists deployment status and mirrors it onto the Activity timeline.
   *
   * Existing behavior (DB status/message/error update + socket consumers) is unchanged.
   * Activity sync is best-effort: if no open activity exists for a terminal status,
   * a fallback activity row is created so the event is not lost.
   *
   * @param deploymentId - Service deployment id.
   * @param status - New deployment status.
   * @param options - Optional status message and error text from the agent or CP.
   */
  async updateStatus(
    deploymentId: string,
    status: DeploymentStatus,
    options: { message?: string; error?: string } = {},
  ): Promise<void> {
    try {
      await this.deploymentRepository.update(
        { id: deploymentId },
        {
          deploymentStatus: status,
          updatedAt: dayjs().unix(),
          ...(options.message !== undefined
            ? { statusMessage: options.message }
            : {}),
          ...(options.error ? { lastError: options.error } : {}),
        },
      );

      const reason = options.error?.trim() || options.message?.trim() || null;
      const isResourceFailure =
        status === DeploymentStatus.FAILED &&
        this.isResourceValidationFailure(options.message, options.error);

      const activityUpdate: {
        operationStatus: DeploymentStatus;
        message: string | null;
        type?: ActivityType;
      } = {
        operationStatus: status,
        message: isResourceFailure
          ? `Resource validation stopped deployment: ${reason}`
          : options.error
            ? `${options.message ?? status}: ${options.error}`
            : (options.message ?? null),
        ...(isResourceFailure
          ? { type: ActivityType.DEPLOYMENT_VALIDATION_STOPPED }
          : {}),
      };

      const deployment = await this.deploymentRepository.findOne({
        where: { id: deploymentId, deletedAt: IsNull() },
      });

      if (deployment?.userId && deployment.serverId) {
        await this.activityService.syncOrRecordDeploymentActivity(
          deploymentId,
          activityUpdate,
          {
            userId: deployment.userId,
            serverId: deployment.serverId,
            deploymentId,
            templateSlug: deployment.templateSlug,
            type: isResourceFailure
              ? ActivityType.DEPLOYMENT_VALIDATION_STOPPED
              : ActivityType.DEPLOYMENT,
            title: isResourceFailure
              ? `Deploy blocked · ${deployment.templateSlug}`
              : `Deploy ${deployment.templateSlug}`,
            message: activityUpdate.message,
            operationStatus: status,
          },
        );
      } else {
        await this.activityService.syncDeploymentActivityStatus(
          deploymentId,
          activityUpdate,
        );
      }
    } catch (error) {
      this.logger.error(
        `Update deployment status failed for '${deploymentId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async loadResolvedForAgent(
    deploymentId: string,
    portSchemaKeys: string[],
  ): Promise<{ env: Record<string, string>; ports: Record<string, number> }> {
    try {
      return this.loadStoredVariables(deploymentId, portSchemaKeys);
    } catch (error) {
      this.logger.error(
        `Load resolved variables failed for deployment '${deploymentId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private async upsertDeploymentRecord(opts: {
    deploymentId: string;
    templateSlug: string;
    serviceTemplateId?: string | null;
    displayName?: string | null;
    serverId: string;
    userId: string;
    deploymentStatus: DeploymentStatus;
    deploymentType?: DeploymentType;
    encryptedComposeContent?: string | null;
  }): Promise<void> {
    try {
      const existing = await this.deploymentRepository.findOne({
        where: { id: opts.deploymentId },
      });

      if (existing) {
        existing.templateSlug = opts.templateSlug;
        if (opts.serviceTemplateId !== undefined) {
          existing.serviceTemplateId = opts.serviceTemplateId;
        }
        if (opts.displayName !== undefined) {
          existing.displayName = opts.displayName;
        }
        existing.serverId = opts.serverId;
        existing.userId = opts.userId;
        existing.deploymentStatus = opts.deploymentStatus;
        if (opts.deploymentType !== undefined) {
          existing.deploymentType = opts.deploymentType;
        }
        if (opts.encryptedComposeContent !== undefined) {
          existing.encryptedComposeContent = opts.encryptedComposeContent;
        }
        await this.deploymentRepository.save(existing);
        return;
      }

      const deployment = this.deploymentRepository.create({
        id: opts.deploymentId,
        templateSlug: opts.templateSlug,
        serviceTemplateId: opts.serviceTemplateId ?? null,
        displayName: opts.displayName ?? null,
        serverId: opts.serverId,
        userId: opts.userId,
        deploymentStatus: opts.deploymentStatus,
        statusMessage: null,
        lastError: null,
        deploymentType: opts.deploymentType ?? DeploymentType.PLATFORM_SERVICE,
        encryptedComposeContent: opts.encryptedComposeContent ?? null,
      });

      await this.deploymentRepository.save(deployment);
    } catch (error) {
      throw new BadRequestException(
        `Failed to persist deployment record: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Encrypts and stores the resolved compose YAML that reflects deployed env/port values.
   */
  private async persistEncryptedDeployedCompose(
    deploymentId: string,
    composeYaml: string,
    mergedEnv: Record<string, string>,
    mergedPorts: Record<string, number>,
  ): Promise<void> {
    try {
      const deployedYaml = buildDeployedComposeYaml(
        composeYaml,
        mergedEnv,
        mergedPorts,
      );
      const encryptedComposeContent =
        this.encryptionService.encrypt(deployedYaml);

      await this.deploymentRepository.update(deploymentId, {
        encryptedComposeContent,
      });
    } catch (error) {
      throw new BadRequestException(
        `Failed to encrypt compose content: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolves a human-readable service label for container overview rows.
   */
  private resolveDeploymentServiceName(
    deployment: ServiceDeploymentEntity,
  ): string | null {
    if (deployment.deploymentType === DeploymentType.CUSTOM_SERVICE) {
      return (
        deployment.displayName?.trim() || deployment.template?.name || null
      );
    }

    return deployment.template?.name?.trim() || null;
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
   * Deactivates deployment records and optionally purges remote resources via the connected agent.
   * Called while the server row is still active so agent install can run when needed.
   */
  async deactivateDeploymentsForServerDeletion(
    serverId: string,
    userId: string,
    options: { removeManagedServices: boolean },
  ): Promise<void> {
    try {
      const terminalStatuses: DeploymentStatus[] = [
        DeploymentStatus.REMOVED,
        DeploymentStatus.REMOVING,
      ];

      const deployments = await this.deploymentRepository.find({
        where: {
          serverId,
          userId,
          deletedAt: IsNull(),
          status: EntityStatus.ACTIVE,
          deploymentStatus: Not(In(terminalStatuses)),
        },
      });

      if (deployments.length === 0) {
        return;
      }

      if (options.removeManagedServices) {
        await this.ensureAgentConnectedForServer(serverId);

        for (const deployment of deployments) {
          if (!this.deploymentGateway.isAgentConnectedForServer(serverId)) {
            this.logger.warn(
              `Server delete: no connected agent for deployment '${deployment.id}' on server '${serverId}'`,
            );
            continue;
          }

          try {
            await this.deploymentGateway.requestDeploymentRemove(
              serverId,
              deployment.id,
              deployment.templateSlug,
            );
            this.logger.log(
              `Server delete: agent removed deployment '${deployment.id}' on server '${serverId}'`,
            );
          } catch (error) {
            this.logger.warn(
              `Server delete: agent removal failed for deployment '${deployment.id}' on server '${serverId}': ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }

      const now = dayjs().unix();
      await this.deploymentRepository.update(
        { id: In(deployments.map((deployment) => deployment.id)) },
        {
          status: EntityStatus.INACTIVE,
          deploymentStatus: DeploymentStatus.REMOVED,
          statusMessage: DEPLOYMENT_MESSAGES.SERVER_DELETE_DEACTIVATED,
          lastError: null,
          deletedAt: now,
          updatedAt: now,
        },
      );

      this.logger.log(
        `Marked ${deployments.length} deployment(s) inactive for deleted server '${serverId}'`,
      );
    } catch (error) {
      this.logger.error(
        `Deactivate deployments for server deletion failed for '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
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
    try {
      const deployment = await this.getDeployment(deploymentId);

      if (
        REMOVAL_BLOCKING_DEPLOYMENT_STATUSES.includes(
          deployment.deploymentStatus,
        )
      ) {
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

      if (deployment.userId) {
        await this.activityService.recordActivity({
          userId: deployment.userId,
          serverId,
          deploymentId,
          templateSlug: deployment.templateSlug,
          type: ActivityType.DEPLOYMENT_REMOVE,
          title: `Remove ${deployment.templateSlug}`,
          operationStatus: DeploymentStatus.REMOVING,
          message: SUCCESS_MESSAGES.REMOVING,
        });
      }

      await this.updateStatus(deploymentId, DeploymentStatus.REMOVING, {
        message: SUCCESS_MESSAGES.REMOVING,
      });

      const message: SocketRemoveMessage = {
        type: "REMOVE",
        payload: {
          deploymentId,
          templateSlug: deployment.templateSlug,
        },
      };

      try {
        this.deploymentGateway.emitRemove(message, serverId);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to emit removal for deployment '${deploymentId}': ${errorMessage}`,
        );
        await this.updateStatus(deploymentId, DeploymentStatus.FAILED, {
          message: "Failed to remove deployment",
          error: errorMessage,
        });
        throw error;
      }

      this.logger.log(`Removal requested for deployment '${deploymentId}'`);

      return {
        deploymentId,
        status: DeploymentStatus.REMOVING,
        message: SUCCESS_MESSAGES.REMOVING,
      };
    } catch (error) {
      this.logger.error(
        `Remove deployment '${deploymentId}' failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Soft-deletes a deployment owned by the caller (no agent teardown).
   * Used for offline managed stubs where only the DB row remains.
   */
  async discardOwnedDeploymentRecord(
    deploymentId: string,
    userId: string,
  ): Promise<{ deploymentId: string; message: string }> {
    try {
      const deployment = await this.deploymentRepository.findOne({
        where: {
          id: deploymentId,
          userId,
          deletedAt: IsNull(),
        },
      });

      if (!deployment) {
        throw new NotFoundException(
          `Deployment '${deploymentId}' not found or not owned by you`,
        );
      }

      await this.softDeleteDeploymentRecord(deploymentId, {
        message: DEPLOYMENT_MESSAGES.ORPHANED_RECORD_DISCARDED,
      });

      return {
        deploymentId,
        message: DEPLOYMENT_MESSAGES.ORPHANED_RECORD_DISCARDED,
      };
    } catch (error) {
      this.logger.error(
        `Discard deployment record '${deploymentId}' failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Soft-deletes a deployment after agent teardown while preserving env vars and history.
   */
  async softDeleteDeploymentRecord(
    deploymentId: string,
    options: { message?: string } = {},
  ): Promise<void> {
    try {
      const deployment = await this.deploymentRepository.findOne({
        where: { id: deploymentId, deletedAt: IsNull() },
      });

      if (!deployment) {
        return;
      }

      const now = dayjs().unix();
      await this.deploymentRepository.update(
        { id: deploymentId },
        {
          status: EntityStatus.INACTIVE,
          deploymentStatus: DeploymentStatus.REMOVED,
          statusMessage: options.message ?? SUCCESS_MESSAGES.REMOVAL_COMPLETED,
          lastError: null,
          deletedAt: now,
          updatedAt: now,
        },
      );

      if (deployment.userId && deployment.serverId) {
        await this.activityService.syncOrRecordDeploymentActivity(
          deploymentId,
          {
            operationStatus: DeploymentStatus.REMOVED,
            message: options.message ?? SUCCESS_MESSAGES.REMOVAL_COMPLETED,
          },
          {
            userId: deployment.userId,
            serverId: deployment.serverId,
            deploymentId,
            templateSlug: deployment.templateSlug,
            type: ActivityType.DEPLOYMENT_REMOVE,
            title: `Remove ${deployment.templateSlug}`,
            message: options.message ?? SUCCESS_MESSAGES.REMOVAL_COMPLETED,
            operationStatus: DeploymentStatus.REMOVED,
          },
        );
      } else {
        await this.activityService.syncDeploymentActivityStatus(deploymentId, {
          operationStatus: DeploymentStatus.REMOVED,
          message: options.message ?? SUCCESS_MESSAGES.REMOVAL_COMPLETED,
        });
      }

      this.logger.log(`Soft-deleted deployment record '${deploymentId}'`);
    } catch (error) {
      this.logger.error(
        `Soft delete deployment '${deploymentId}' failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Resolves a human container label for activity copy.
   *
   * Prefers the client-provided name, then live discovery, then a short id.
   * Discovery failures are logged and ignored so container actions still proceed.
   *
   * @param serverId - Server to discover containers on.
   * @param containerId - Docker container id.
   * @param preferredName - Optional name from the console.
   * @returns Display label for titles/messages.
   */
  private async resolveContainerLabel(
    serverId: string,
    containerId: string,
    preferredName?: string | null,
  ): Promise<string> {
    const fromPreferred = preferredName?.trim()
      ? normalizeDockerContainerName(preferredName)
      : "";
    if (fromPreferred) {
      return fromPreferred;
    }

    try {
      const discovered =
        await this.serverConnectionsService.discoverContainers(serverId);
      const queryId = containerId.toLowerCase();
      const match = discovered.find((container) => {
        const id = container.containerId.trim().toLowerCase();
        return (
          id === queryId || id.startsWith(queryId) || queryId.startsWith(id)
        );
      });
      const discoveredName = match?.containerName
        ? normalizeDockerContainerName(match.containerName)
        : "";
      if (discoveredName) {
        return discoveredName;
      }
    } catch (error) {
      this.logger.warn(
        `Could not resolve container name for '${containerId}' on server '${serverId}': ${toErrorMessage(error)}`,
      );
    }

    return resolveActivityContainerLabel(containerId);
  }

  /**
   * True when a failure message indicates RAM/CPU/port resource validation stopped the deploy.
   *
   * Matches agent strings such as "Not enough RAM…", "Not enough CPU…", and
   * "Port N is already in use…".
   *
   * @param message - Optional status message from CP or agent.
   * @param error - Optional error text from CP or agent.
   * @returns True when the combined text looks like a resource validation failure.
   */
  private isResourceValidationFailure(
    message?: string | null,
    error?: string | null,
  ): boolean {
    const text = `${message ?? ""} ${error ?? ""}`.toLowerCase();
    return (
      text.includes("insufficient ram") ||
      text.includes("insufficient cpu") ||
      text.includes("not enough ram") ||
      text.includes("not enough memory") ||
      text.includes("not enough cpu") ||
      (text.includes("port") && text.includes("in use")) ||
      (text.includes("port") && text.includes("occupied")) ||
      (text.includes("resource") && text.includes("unavailable"))
    );
  }

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
