import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DataSource,
  FindOneOptions,
  Repository,
  IsNull,
  FindOptionsWhere,
  In,
  Not,
  ILike,
} from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import {
  CreateServerDto,
  CreateServerSshCredentialRequestDto,
  CreateServerOnboardRequestDto,
  DeleteServerResponseDto,
  OnboardSuccessData,
  ListServersQueryDto,
  UpdateServerDto,
  ServerResponseDto,
  ServerResourcesResponseDto,
} from "../dto";
import { DeploymentGateway } from "@control-panel/websocket/websocket.gateway";
import { ServerSshCredentialEntity } from "../entities/server-ssh-credential.entity";
import { ServerEntity } from "../entities/server.entity";
import {
  EncryptionService,
  logStructured,
  logStructuredError,
} from "@shared/common";
import {
  SshHealthCheckService,
  SshCommandExecutorService,
  ExecuteResult,
  SshConnectionManager,
  SshConnectionOptions,
} from "@shared/ssh";
import {
  AgentInstallLogCallback,
  AgentInstallResult,
} from "../interfaces/agent-install.interfaces";
import { AgentInstallService } from "./agent-install.service";
import { AgentServerBindingService } from "./agent-server-binding.service";
import { RemoteAgentInstallService } from "./remote-agent-install.service";
import { AgentSocketTunnelService } from "./agent-socket-tunnel.service";
import { ServerType } from "../enums/server-type.enum";
import {
  DEFAULT_SSH_PORT,
  ONBOARD_SSH_TEST_SERVER_ID,
} from "../server-connections.constants";
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_LIST_PAGE,
  DEFAULT_LIST_SORT_BY,
  DEFAULT_LIST_SORT_ORDER,
} from "../constants/server-onboard.constants";
import { SERVER_ONBOARD_LOGS } from "../constants/server-onboard-messages.constants";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import dayjs from "dayjs";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { PaginatedResponse, parseDockerPsStdout } from "@shared/common";
import {
  DeploymentEvents,
  DeploymentStatus,
  type ContainerActionResponsePayload,
  type ContainerActionType,
  type DiscoveredContainerPayload,
  type ServerResourcesMetricsPayload,
} from "@shared/socket-events";
import { buildHostContainerActionCommand } from "@control-panel/modules/deployments/utils/container-action.util";
import { LocalAgentHostAdapter } from "../adapters/local-agent-host.adapter";
import { SshAgentHostAdapter } from "../adapters/ssh-agent-host.adapter";
import {
  HOST_RESOURCES_COMMAND_TIMEOUT_MS,
  HOST_RESOURCES_SHELL_COMMAND,
} from "../constants/server-resources.constants";
import { parseHostResourcesOutput } from "../utils/parse-host-resources-output.util";
import { toServerResponseDto } from "../utils/server.mapper";
import { OperationFailedException } from "@control-panel/common/exceptions/operation-failed.exception";
import { ExistingServerCheck } from "../interfaces/existing-server-check.interface";
import { OnboardFailureParams } from "../interfaces/onboard-failure-params.interface";
import { RunAgentInstallAfterOnboardParams } from "../interfaces/run-agent-install-after-onboard-params.interface";
import { ServerErrorCode } from "../enums/server-error-code.enum";
import { ContainerAction } from "../enums/container-action.enum";
import { mapSshTestErrorCode } from "../utils/map-ssh-test-error-code.util";
import { runSshHealthTestWithTimeout } from "../utils/run-ssh-health-test.util";
import {
  assertOnboardSshInput,
  buildOnboardServerConnectionInfo,
  buildOnboardSshTestOptions,
  encryptCredentialFields,
  OnboardSshServerInfo,
} from "../utils/server-ssh-credential.util";
import { isUUID } from "class-validator";
import { DeploymentsService } from "@control-panel/modules/deployments/deployments.service";
import { ActivityService } from "@control-panel/modules/activity/services/activity.service";
import { ActivityType } from "@control-panel/modules/activity/enums/activity-type.enum";
import {
  AGENT_INSTALL,
  AGENT_INSTALL_ENV_KEYS,
} from "../constants/agent-install.constants";
import { buildAgentHostCleanupShellCommand } from "../utils/agent-host-cleanup.util";
import { SERVER_CONNECTIONS } from "../constants/server-connections.constants";
import {
  buildServerOperationMetadata,
  readServerOperationFromMetadata,
  SERVER_OPERATION_STATUS,
  type ServerOperationStatus,
} from "../utils/server-operation.util";
import {
  AgentHealthCronResult,
  ServerAgentError,
} from "../interfaces/server-health.interface";

@Injectable()
export class ServerConnectionsService {
  private readonly logger = new Logger(ServerConnectionsService.name);
  /**
   * Process-local guard against overlapping cron ticks in one instance only.
   * Not persisted — on restart there is no in-flight check, which is safe.
   */
  private agentHealthCheckInProgress = false;

  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
    @InjectRepository(ServerSshCredentialEntity)
    private readonly credentialRepository: Repository<ServerSshCredentialEntity>,
    private readonly dataSource: DataSource,
    private readonly encryptionService: EncryptionService,
    private readonly health: SshHealthCheckService,
    private readonly executor: SshCommandExecutorService,
    private readonly sshManager: SshConnectionManager,
    private readonly remoteAgentInstall: RemoteAgentInstallService,
    private readonly agentSocketTunnel: AgentSocketTunnelService,
    private readonly agentInstall: AgentInstallService,
    private readonly agentServerBinding: AgentServerBindingService,
    @Inject(forwardRef(() => DeploymentGateway))
    private readonly deploymentGateway: DeploymentGateway,
    @Inject(forwardRef(() => DeploymentsService))
    private readonly deploymentsService: DeploymentsService,
    private readonly configService: ConfigService,
    private readonly activityService: ActivityService,
  ) {}

  /**
   * Installs (or refreshes) the agent on the target host when it is not connected.
   *
   * Local servers use the same prerequisite + docker-compose flow as remote SSH onboard.
   * Remote self-host: opens an SSH reverse tunnel via {@link AgentSocketTunnelService}
   * before install so the agent can reach the panel at `host.docker.internal:{AGENT_SOCKET_TUNNEL_PORT}`.
   *
   * @param serverId - Active server UUID.
   * @param options.plainPrivateKey - Optional decrypted key for tunnel + install SSH.
   * @param options.onLogLine - Optional install log stream callback.
   * @returns Install result; fails early if the self-host tunnel cannot be opened.
   */
  async ensureAgentInstalledForServer(
    serverId: string,
    options?: {
      plainPrivateKey?: string;
      onLogLine?: AgentInstallLogCallback;
    },
  ): Promise<AgentInstallResult> {
    try {
      const server = await this.serverRepository.findOne({
        where: {
          id: serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      if (!server) {
        return {
          success: false,
          logs: [],
          error: ERROR_MESSAGES.SERVER.INACTIVE_OR_MISSING,
        };
      }

      if (await this.attachToExistingHostAgentIfOnline(server)) {
        return {
          success: true,
          logs: [SERVER_ONBOARD_LOGS.AGENT_REUSED_EXISTING],
          skipped: true,
        };
      }

      if (server.serverType === ServerType.LOCAL) {
        return this.agentInstall.installOnLocal(
          { serverId },
          { onLogLine: options?.onLogLine },
        );
      }

      const tunnel = await this.agentSocketTunnel.ensureForServerId(
        serverId,
        options?.plainPrivateKey,
      );
      if (!tunnel.ok) {
        return {
          success: false,
          logs: [],
          error: tunnel.error ?? "Failed to open self-host SSH socket tunnel",
        };
      }

      const credential = await this.credentialRepository.findOne({
        where: { serverId, status: EntityStatus.ACTIVE, deletedAt: IsNull() },
      });

      if (!credential) {
        return {
          success: false,
          logs: [],
          error: ERROR_MESSAGES.SERVER.AGENT_CREDENTIALS_MISSING,
        };
      }

      return this.remoteAgentInstall.install(
        {
          connection: this.buildSshOptions(
            server,
            credential,
            options?.plainPrivateKey,
          ),
          serverHost: server.host,
          plainPrivateKey: options?.plainPrivateKey,
        },
        { onLogLine: options?.onLogLine },
      );
    } catch (error) {
      this.logger.error(
        `Ensure agent installed failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Restores agent connectivity: remove orphans, start a stopped container, recreate a broken one, or install fresh.
   *
   * Self-host remotes: ensures the SSH reverse tunnel is up before recovery/install.
   *
   * @param serverId - Active server to recover.
   * @param options.plainPrivateKey - Optional decrypted SSH key for remote install.
   * @param options.onLogLine - Optional install log callback.
   * @returns Install/recovery result, or skipped when already connected or recovery is in progress.
   */
  async recoverAgentForServer(
    serverId: string,
    options?: {
      plainPrivateKey?: string;
      onLogLine?: AgentInstallLogCallback;
    },
  ): Promise<AgentInstallResult> {
    try {
      if (this.deploymentGateway.isAgentConnectedForServer(serverId)) {
        return { success: true, logs: [], skipped: true };
      }

      const tunnel = await this.agentSocketTunnel.ensureForServerId(
        serverId,
        options?.plainPrivateKey,
      );
      if (!tunnel.ok) {
        return {
          success: false,
          logs: [],
          error: tunnel.error ?? "Failed to open self-host SSH socket tunnel",
        };
      }

      const serverRow = await this.serverRepository.findOne({
        where: {
          id: serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
        select: { id: true, agentError: true },
      });

      if (this.isRecoveryInProgress(serverRow?.agentError ?? null)) {
        return {
          success: true,
          logs: ["Agent recovery already in progress"],
          skipped: true,
        };
      }

      await this.setRecoveryInProgress(serverId, true);

      try {
        const agentContainers = await this.findAgentContainersOnHost(serverId);
        const orphanAgents = agentContainers.filter(
          (container) =>
            !this.isCanonicalAgentContainerName(container.containerName),
        );

        for (const container of orphanAgents) {
          this.logger.warn(
            `Removing orphan agent container '${container.containerName}' (${container.status}) on server '${serverId}'`,
          );
          await this.executeContainerActionOnHost(
            serverId,
            container.containerId,
            ContainerAction.DELETE,
          );
        }

        const remainingAgents = agentContainers.filter((container) =>
          this.isCanonicalAgentContainerName(container.containerName),
        );
        const runningAgents = remainingAgents.filter((container) =>
          this.isDockerContainerRunning(container.status),
        );
        const stoppedAgents = remainingAgents.filter(
          (container) => !this.isDockerContainerRunning(container.status),
        );

        if (runningAgents.length > 0) {
          logStructured(this.logger, "log", "agent.recovery", "skipped", {
            module: "ServerConnectionsService",
            serverId,
            reason: "container_running_awaiting_websocket",
          });
          return {
            success: true,
            logs: [
              "Agent container is running, waiting for WebSocket reconnect",
            ],
            skipped: true,
          };
        }

        const startableAgents = stoppedAgents.filter((container) =>
          this.isDockerContainerStartable(container.status),
        );
        const brokenAgents = stoppedAgents.filter(
          (container) => !this.isDockerContainerStartable(container.status),
        );

        for (const container of brokenAgents) {
          this.logger.warn(
            `Removing broken agent container '${container.containerName}' (${container.status}) on server '${serverId}'`,
          );
          await this.executeContainerActionOnHost(
            serverId,
            container.containerId,
            ContainerAction.DELETE,
          );
        }

        if (startableAgents.length > 0) {
          for (const container of startableAgents) {
            this.logger.log(
              `Starting stopped agent container '${container.containerName}' (${container.status}) on server '${serverId}'`,
            );
            const startResult = await this.executeContainerActionOnHost(
              serverId,
              container.containerId,
              ContainerAction.START,
            );

            if (startResult.success) {
              return {
                success: true,
                logs: [
                  `Started agent container ${container.containerName} (${container.status})`,
                ],
              };
            }
          }

          logStructured(this.logger, "warn", "agent.recovery", "retry", {
            module: "ServerConnectionsService",
            serverId,
            reason: "failed_to_start_stopped_container",
          });
        }

        logStructured(this.logger, "log", "agent.recovery", "started", {
          module: "ServerConnectionsService",
          serverId,
          reason:
            startableAgents.length > 0 || brokenAgents.length > 0
              ? "reinstall_after_cleanup"
              : "no_agent_container_found",
        });
        return await this.ensureAgentInstalledForServer(serverId, options);
      } finally {
        await this.setRecoveryInProgress(serverId, false);
      }
    } catch (error) {
      logStructuredError(this.logger, "agent.recovery", error, {
        module: "ServerConnectionsService",
        serverId,
      });
      throw error;
    }
  }

  private shouldInstallAgent(installAgent: boolean | undefined): boolean {
    return installAgent !== false;
  }

  private static readonly DOCKER_PS_COMMAND =
    "docker ps -a --format '{{json .}}'";
  private static readonly DOCKER_PS_TIMEOUT_MS = 10_000;
  private static readonly CONTAINER_ACTION_TIMEOUT_MS = 60_000;

  /**
   * Lists Docker containers on a server via the connected agent socket first,
   * then falls back to direct host SSH/local execution.
   */
  async discoverContainers(
    serverId: string,
  ): Promise<DiscoveredContainerPayload[]> {
    try {
      let discovered: DiscoveredContainerPayload[] | null = null;
      let socketError: string | null = null;

      if (this.deploymentGateway.isAgentConnectedForServer(serverId)) {
        const agentVersion =
          this.deploymentGateway.getAgentVersion(serverId) ?? "unknown";
        const supportsDiscovery = this.deploymentGateway.agentSupports(
          serverId,
          DeploymentEvents.CONTAINER_DISCOVER,
        );

        logStructured(this.logger, "log", "container.discover", "started", {
          module: "ServerConnectionsService",
          serverId,
          agentVersion,
          supportsContainerDiscover: supportsDiscovery,
        });

        if (!supportsDiscovery) {
          socketError = `Connected agent (version ${agentVersion}) does not support container discovery`;
          logStructured(this.logger, "warn", "container.discover", "skipped", {
            module: "ServerConnectionsService",
            serverId,
            reason: socketError,
          });
        } else {
          try {
            discovered = await this.deploymentGateway.requestContainerDiscovery(
              serverId,
              SERVER_CONNECTIONS.SOCKET_CONTAINER_DISCOVER_ATTEMPT_MS,
            );
            logStructured(
              this.logger,
              "log",
              "container.discover",
              "succeeded",
              {
                module: "ServerConnectionsService",
                serverId,
                containerCount: discovered.length,
              },
            );
          } catch (error) {
            socketError =
              error instanceof Error ? error.message : String(error);
            logStructured(this.logger, "warn", "container.discover", "failed", {
              module: "ServerConnectionsService",
              serverId,
              error: socketError,
            });
          }
        }
      } else {
        socketError = `No connected agent for server '${serverId}'`;
        logStructured(this.logger, "warn", "container.discover", "failed", {
          module: "ServerConnectionsService",
          serverId,
          reason: "no_connected_agent",
        });
      }

      if (!discovered) {
        logStructured(this.logger, "warn", "container.discover", "retry", {
          module: "ServerConnectionsService",
          serverId,
          reason: socketError ?? "agent_unavailable",
          target: "host",
        });
        return this.discoverContainersOnHost(serverId);
      }

      return discovered;
    } catch (error) {
      this.logger.error(
        `Discover containers failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Lists Docker containers on the server host via local shell or SSH.
   * Used only when the connected agent is unavailable or socket communication fails.
   */
  async discoverContainersOnHost(
    serverId: string,
  ): Promise<DiscoveredContainerPayload[]> {
    try {
      const server = await this.serverRepository.findOne({
        where: {
          id: serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      if (!server) {
        throw new NotFoundException(ERROR_MESSAGES.SERVER.NOT_FOUND);
      }

      let result: ExecuteResult;

      if (server.serverType === ServerType.LOCAL) {
        const host = new LocalAgentHostAdapter();
        result = await host.executeCommand(
          ServerConnectionsService.DOCKER_PS_COMMAND,
          ServerConnectionsService.DOCKER_PS_TIMEOUT_MS,
        );
      } else {
        const credential = await this.credentialRepository.findOne({
          where: {
            serverId,
            status: EntityStatus.ACTIVE,
            deletedAt: IsNull(),
          },
          order: { createdAt: "DESC" },
        });

        if (!credential) {
          throw new BadRequestException(
            ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
          );
        }

        const sshOptions = this.buildSshOptions(server, credential);
        let client = this.sshManager.getConnection(serverId);
        if (!client) {
          client = await this.sshManager.connect(sshOptions);
        }

        const host = new SshAgentHostAdapter(client, this.executor);
        result = await host.executeCommand(
          ServerConnectionsService.DOCKER_PS_COMMAND,
          ServerConnectionsService.DOCKER_PS_TIMEOUT_MS,
        );
      }

      if (!result.success) {
        const detail =
          result.stderr?.trim() ||
          result.stdout?.trim() ||
          `docker ps failed (exit ${result.exitCode ?? "unknown"})`;
        throw new BadRequestException(
          `Failed to list containers on server: ${detail}`,
        );
      }

      return parseDockerPsStdout(result.stdout);
    } catch (error) {
      this.logger.error(
        `Discover containers on host failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Returns true when the Kubeara agent is connected via WebSocket or its container is running on the host.
   *
   * @param serverId - Server to inspect.
   * @returns True when connected or a running kubeara-agent container exists.
   */
  async isAgentInstalledOnServer(serverId: string): Promise<boolean> {
    if (this.deploymentGateway.isAgentConnectedForServer(serverId)) {
      return true;
    }

    try {
      const containers = await this.findAgentContainersOnHost(serverId);
      return containers.some((container) =>
        this.isDockerContainerRunning(container.status),
      );
    } catch (error) {
      this.logger.warn(
        `Could not determine whether agent is installed on server '${serverId}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Executes a container lifecycle action directly on the server host via local shell or SSH.
   * Used only when the connected agent is unavailable or socket communication fails.
   */
  async executeContainerActionOnHost(
    serverId: string,
    containerId: string,
    action: ContainerActionType,
  ): Promise<ContainerActionResponsePayload> {
    try {
      const server = await this.serverRepository.findOne({
        where: {
          id: serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      if (!server) {
        throw new NotFoundException(ERROR_MESSAGES.SERVER.NOT_FOUND);
      }

      const command = buildHostContainerActionCommand(action, containerId);
      logStructured(this.logger, "log", "container.action", "retry", {
        module: "ServerConnectionsService",
        serverId,
        action,
        containerId,
        target: "host",
        command,
      });
      let result: ExecuteResult;

      if (server.serverType === ServerType.LOCAL) {
        const host = new LocalAgentHostAdapter();
        result = await host.executeCommand(
          command,
          ServerConnectionsService.CONTAINER_ACTION_TIMEOUT_MS,
        );
      } else {
        const credential = await this.credentialRepository.findOne({
          where: {
            serverId,
            status: EntityStatus.ACTIVE,
            deletedAt: IsNull(),
          },
          order: { createdAt: "DESC" },
        });

        if (!credential) {
          throw new BadRequestException(
            ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
          );
        }

        const sshOptions = this.buildSshOptions(server, credential);
        let client = this.sshManager.getConnection(serverId);
        if (!client) {
          client = await this.sshManager.connect(sshOptions);
        }

        const host = new SshAgentHostAdapter(client, this.executor);
        result = await host.executeCommand(
          command,
          ServerConnectionsService.CONTAINER_ACTION_TIMEOUT_MS,
        );
      }

      const success = Boolean(result.success);
      const detail =
        result.stderr?.trim() ||
        result.stdout?.trim() ||
        `docker ${action} failed (exit ${result.exitCode ?? "unknown"})`;

      return {
        requestId: "host-fallback",
        containerId: containerId.trim(),
        action,
        success,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.exitCode ?? (success ? 0 : 1),
        error: success ? undefined : detail,
      };
    } catch (error) {
      this.logger.error(
        `Container action on host failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Ensures the connected agent removes itself from the remote host (last step of server deletion).
   */
  private async removeAgentFromRemoteServer(serverId: string): Promise<void> {
    const agentImage =
      this.configService.get<string>(
        AGENT_INSTALL_ENV_KEYS.KUBEARA_AGENT_IMAGE,
      ) ?? AGENT_INSTALL.DEFAULT_IMAGE;

    let imageRefs: string[] = [];

    try {
      if (!this.deploymentGateway.isAgentConnectedForServer(serverId)) {
        await this.deploymentsService.ensureAgentConnectedForServer(serverId);
      }
    } catch (error) {
      this.logger.warn(
        `Server delete: could not connect agent for removal on server '${serverId}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.removeLeftoverAgentResourcesOnHost(
        serverId,
        imageRefs,
        agentImage,
      );
      return;
    }

    if (!this.deploymentGateway.isAgentConnectedForServer(serverId)) {
      this.logger.warn(
        `Server delete: skipping agent socket removal — no connected agent for server '${serverId}'`,
      );
      await this.removeLeftoverAgentResourcesOnHost(
        serverId,
        imageRefs,
        agentImage,
      );
      return;
    }

    try {
      const removal = await this.deploymentGateway.requestAgentRemove(
        serverId,
        {
          installDir: AGENT_INSTALL.REMOTE_DIR,
          agentImage,
        },
      );
      imageRefs = removal.imageRefs;
      this.logger.log(
        `Server delete: agent teardown acknowledged for server '${serverId}'`,
      );
    } catch (error) {
      this.logger.warn(
        `Server delete: agent socket removal failed for server '${serverId}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await this.removeLeftoverAgentResourcesOnHost(
      serverId,
      imageRefs,
      agentImage,
    );
  }

  /**
   * Force-removes leftover Kubeara agent containers, volumes, and images on the host.
   * Uses local shell for local servers and SSH for remote servers when socket teardown did not finish the job.
   */
  private async removeLeftoverAgentResourcesOnHost(
    serverId: string,
    imageRefs: string[],
    configuredImage: string,
  ): Promise<void> {
    const server = await this.serverRepository.findOne({
      where: { id: serverId, deletedAt: IsNull() },
    });

    if (!server) {
      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, SERVER_CONNECTIONS.AGENT_TEARDOWN_SETTLE_MS),
    );

    const command = buildAgentHostCleanupShellCommand(imageRefs, {
      installDir: AGENT_INSTALL.REMOTE_DIR,
      configuredImage,
    });

    try {
      if (server.serverType === ServerType.LOCAL) {
        const host = new LocalAgentHostAdapter();
        const result = await host.executeCommand(
          command,
          SERVER_CONNECTIONS.AGENT_IMAGE_REMOVE_TIMEOUT_MS,
        );
        if (!result.success) {
          this.logger.warn(
            `Server delete: local agent cleanup on '${serverId}' reported: ${
              result.stderr?.trim() || result.stdout?.trim() || "unknown error"
            }`,
          );
        } else {
          this.logger.log(
            `Server delete: completed local agent resource cleanup for server '${serverId}'`,
          );
        }
        return;
      }

      const credential = await this.credentialRepository.findOne({
        where: {
          serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
        order: { createdAt: "DESC" },
      });

      if (!credential) {
        this.logger.warn(
          `Server delete: SSH agent cleanup skipped — no credentials for server '${serverId}'`,
        );
        return;
      }

      const sshOptions = this.buildSshOptions(server, credential);
      let client = this.sshManager.getConnection(serverId);
      if (!client) {
        client = await this.sshManager.connect(sshOptions);
      }

      const host = new SshAgentHostAdapter(client, this.executor);
      const result = await host.executeCommand(
        command,
        SERVER_CONNECTIONS.AGENT_IMAGE_REMOVE_TIMEOUT_MS,
      );

      if (!result.success) {
        this.logger.warn(
          `Server delete: SSH agent cleanup on '${serverId}' reported: ${
            result.stderr?.trim() || result.stdout?.trim() || "unknown error"
          }`,
        );
        return;
      }

      this.logger.log(
        `Server delete: completed SSH agent resource cleanup for server '${serverId}'`,
      );
    } catch (error) {
      this.logger.warn(
        `Server delete: agent resource cleanup failed for server '${serverId}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Fetches on-demand server resource metrics.
   * Tries the connected agent via WebSocket first, then falls back to host SSH/local
   */
  async getServerResources(
    userId: string,
    serverId: string,
  ): Promise<ServerResourcesResponseDto> {
    try {
      await this.getOwnedServer(userId, serverId);

      let resources: ServerResourcesMetricsPayload | null = null;
      let socketError: string | null = null;

      if (this.deploymentGateway.isAgentConnectedForServer(serverId)) {
        const agentVersion =
          this.deploymentGateway.getAgentVersion(serverId) ?? "unknown";
        const supportsResources = this.deploymentGateway.agentSupports(
          serverId,
          DeploymentEvents.SERVER_GET_RESOURCES,
        );

        logStructured(this.logger, "log", "server.resources", "started", {
          module: "ServerConnectionsService",
          serverId,
          agentVersion,
          supportsServerResources: supportsResources,
        });

        if (!supportsResources) {
          socketError = `Connected agent (version ${agentVersion}) does not support server resource collection`;
          logStructured(this.logger, "warn", "server.resources", "skipped", {
            module: "ServerConnectionsService",
            serverId,
            reason: socketError,
          });
        } else {
          try {
            resources = await this.deploymentGateway.requestServerResources(
              serverId,
              SERVER_CONNECTIONS.SOCKET_RESOURCES_ATTEMPT_MS,
            );
            logStructured(this.logger, "log", "server.resources", "succeeded", {
              module: "ServerConnectionsService",
              serverId,
            });
          } catch (error) {
            socketError =
              error instanceof Error ? error.message : String(error);
            logStructured(this.logger, "warn", "server.resources", "failed", {
              module: "ServerConnectionsService",
              serverId,
              error: socketError,
            });
          }
        }
      } else {
        socketError = `No connected agent for server '${serverId}'`;
        logStructured(this.logger, "warn", "server.resources", "failed", {
          module: "ServerConnectionsService",
          serverId,
          reason: "no_connected_agent",
        });
      }

      if (!resources) {
        logStructured(this.logger, "warn", "server.resources", "retry", {
          module: "ServerConnectionsService",
          serverId,
          reason: socketError ?? "agent_unavailable",
          target: "host",
        });
        try {
          resources = await this.collectResourcesOnHost(serverId);
        } catch (error) {
          const hostMessage =
            error instanceof Error ? error.message : String(error);
          const detail = socketError
            ? `Agent: ${socketError}. Host: ${hostMessage}`
            : hostMessage;
          throw new BadRequestException(
            `Failed to collect server resources: ${detail}`,
          );
        }
      }

      return {
        serverId,
        timestamp: new Date().toISOString(),
        cpu: resources.cpu,
        memory: resources.memory,
        disk: resources.disk,
        network: resources.network,
        system: resources.system,
      };
    } catch (error) {
      this.logger.error(
        `Get server resources failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Collects server resource metrics directly on the host via local shell or SSH.
   */
  async collectResourcesOnHost(
    serverId: string,
  ): Promise<ServerResourcesMetricsPayload> {
    try {
      const server = await this.serverRepository.findOne({
        where: {
          id: serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      if (!server) {
        throw new NotFoundException(ERROR_MESSAGES.SERVER.NOT_FOUND);
      }

      let result: ExecuteResult;

      if (server.serverType === ServerType.LOCAL) {
        const host = new LocalAgentHostAdapter();
        result = await host.executeCommand(
          `bash -lc ${JSON.stringify(HOST_RESOURCES_SHELL_COMMAND)}`,
          HOST_RESOURCES_COMMAND_TIMEOUT_MS,
        );
      } else {
        const credential = await this.credentialRepository.findOne({
          where: {
            serverId,
            status: EntityStatus.ACTIVE,
            deletedAt: IsNull(),
          },
          order: { createdAt: "DESC" },
        });

        if (!credential) {
          throw new BadRequestException(
            ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
          );
        }

        const sshOptions = this.buildSshOptions(server, credential);
        let client = this.sshManager.getConnection(serverId);
        if (!client) {
          client = await this.sshManager.connect(sshOptions);
        }

        const host = new SshAgentHostAdapter(client, this.executor);
        result = await host.executeCommand(
          `bash -lc ${JSON.stringify(HOST_RESOURCES_SHELL_COMMAND)}`,
          HOST_RESOURCES_COMMAND_TIMEOUT_MS,
        );
      }

      if (!result.success) {
        const detail =
          result.stderr?.trim() ||
          result.stdout?.trim() ||
          `Host resource collection failed (exit ${result.exitCode ?? "unknown"})`;
        throw new BadRequestException(
          `Failed to collect server resources on host: ${detail}`,
        );
      }

      return parseHostResourcesOutput(result.stdout);
    } catch (error) {
      this.logger.error(
        `Collect resources on host failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private buildSshOptions(
    server: ServerEntity,
    credential: ServerSshCredentialEntity,
    plainPrivateKey?: string,
  ): SshConnectionOptions {
    return {
      serverId: server.id,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: credential.authType,
      encryptedPassword: credential.encryptedPassword ?? null,
      encryptedPrivateKey: credential.encryptedPrivateKey ?? null,
      privateKey: plainPrivateKey,
      privateKeyPassphrase: credential.privateKeyPassphrase ?? null,
    };
  }

  /**
   * Background agent install after onboard (or restore).
   *
   * Self-host: opens the SSH reverse tunnel before install (or when install is skipped
   * but the server still needs socket connectivity). Always disconnects the short-lived
   * install SSH session in `finally`; the tunnel uses a separate long-lived SSH client.
   *
   * @param params.installAgent - When false, only ensures tunnel then skips agent install.
   * @param params.server - Newly onboarded server entity.
   * @param params.credential - SSH credential used for install and tunnel auth.
   * @param params.plainPrivateKey - Optional onboard-time decrypted private key.
   * @param params.logs - Mutable onboard log lines appended by this method.
   * @returns Agent install result including tunnel failures.
   */
  private async runAgentInstallAfterOnboard(
    params: RunAgentInstallAfterOnboardParams,
  ): Promise<AgentInstallResult> {
    try {
      if (!this.shouldInstallAgent(params.installAgent)) {
        const tunnel = await this.agentSocketTunnel.ensureForServer({
          server: params.server,
          credential: params.credential,
          plainPrivateKey: params.plainPrivateKey,
        });
        if (!tunnel.ok) {
          this.sshManager.disconnect(params.server.id);
          return {
            success: false,
            logs: params.logs,
            error: tunnel.error ?? "Failed to open self-host SSH socket tunnel",
          };
        }
        this.sshManager.disconnect(params.server.id);
        return {
          success: true,
          logs: [SERVER_ONBOARD_LOGS.AGENT_INSTALL_SKIPPED],
          skipped: true,
        };
      }

      try {
        const tunnel = await this.agentSocketTunnel.ensureForServer({
          server: params.server,
          credential: params.credential,
          plainPrivateKey: params.plainPrivateKey,
        });
        if (!tunnel.ok) {
          return {
            success: false,
            logs: params.logs,
            error: tunnel.error ?? "Failed to open self-host SSH socket tunnel",
          };
        }
        if (!tunnel.skipped) {
          params.logs.push(SERVER_ONBOARD_LOGS.AGENT_SOCKET_TUNNEL_READY);
        }

        const reused = await this.attachToExistingHostAgentIfOnline(
          params.server,
        );
        if (reused) {
          params.logs.push(SERVER_ONBOARD_LOGS.AGENT_REUSED_EXISTING);
          return {
            success: true,
            logs: [SERVER_ONBOARD_LOGS.AGENT_REUSED_EXISTING],
            skipped: true,
          };
        }

        const result = await this.remoteAgentInstall.install({
          connection: this.buildSshOptions(
            params.server,
            params.credential,
            params.plainPrivateKey,
          ),
          serverHost: params.server.host,
          plainPrivateKey: params.plainPrivateKey,
        });
        params.logs.push(...result.logs);
        return result;
      } finally {
        this.sshManager.disconnect(params.server.id);
      }
    } catch (error) {
      this.logger.error(
        `runAgentInstallAfterOnboard failed for server '${params.server.id}': ${toErrorMessage(error)}`,
      );
      return {
        success: false,
        logs: params.logs,
        error: toErrorMessage(error),
      };
    }
  }

  /**
   * Reuses an online agent on the same host instead of installing again.
   * Returns true when this server is attached to that agent.
   */
  private async attachToExistingHostAgentIfOnline(
    server: Pick<ServerEntity, "id" | "host">,
  ): Promise<boolean> {
    try {
      if (this.deploymentGateway.isAgentConnectedForServer(server.id)) {
        return true;
      }

      const siblingIds =
        await this.agentServerBinding.listActiveServerIdsForHost(server.host);

      for (const siblingId of siblingIds) {
        if (siblingId === server.id) {
          continue;
        }
        if (!this.deploymentGateway.isAgentConnectedForServer(siblingId)) {
          continue;
        }
        return this.deploymentGateway.attachServerToExistingAgent(
          server.id,
          siblingId,
        );
      }

      return false;
    } catch (error) {
      this.logger.warn(
        `Failed to reuse shared agent for server '${server.id}': ${toErrorMessage(error)}`,
      );
      return false;
    }
  }

  /**
   * Sets the operation status for a server in the database.
   */
  private async setServerOperationStatus(
    serverId: string,
    status: ServerOperationStatus | null,
    error?: string | null,
  ): Promise<void> {
    try {
      const server = await this.serverRepository.findOne({
        where: { id: serverId, deletedAt: IsNull() },
      });

      if (!server) {
        return;
      }

      const metadata = buildServerOperationMetadata(
        server.metadata,
        status,
        error,
      );

      server.metadata = metadata;
      await this.serverRepository.save(server);
      this.notifyServerOperationUpdated(serverId, metadata);
    } catch (error) {
      this.logger.error(
        `Failed to set server operation status: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Broadcasts the server operation status update to the websocket.
   */
  private notifyServerOperationUpdated(
    serverId: string,
    metadata: Record<string, unknown> | null,
    options?: { deleted?: boolean },
  ): void {
    try {
      const { operationStatus, operationError } =
        readServerOperationFromMetadata(metadata);

      this.deploymentGateway.broadcastServerOperationUpdated({
        serverId,
        operationStatus,
        operationError,
        deleted: options?.deleted ?? false,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to broadcast server operation updated: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Runs the agent install after onboard asynchronously.
   */
  private runAgentInstallAfterOnboardAsync(
    params: RunAgentInstallAfterOnboardParams,
  ): void {
    void (async () => {
      try {
        const result = await this.runAgentInstallAfterOnboard(params);

        if (result.success || result.skipped) {
          await this.setServerOperationStatus(params.server.id, null);
          return;
        }

        await this.setServerOperationStatus(
          params.server.id,
          SERVER_OPERATION_STATUS.ERROR,
          result.error ?? ERROR_MESSAGES.SERVER.SSH_TEST_FAILED,
        );
      } catch (error) {
        this.logger.error(
          `Background agent install failed for server '${params.server.id}': ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await this.setServerOperationStatus(
          params.server.id,
          SERVER_OPERATION_STATUS.ERROR,
          error instanceof Error ? error.message : String(error),
        );
      }
    })();
  }

  /**
   * Builds the pending agent install response for the onboard success data.
   */
  private buildPendingAgentInstallResponse(
    installAgent: boolean | undefined,
  ): OnboardSuccessData["agentInstall"] {
    if (!this.shouldInstallAgent(installAgent)) {
      return undefined;
    }

    return {
      success: false,
      pending: true,
      logs: [],
    };
  }

  /**
   * Finalizes the server deletion.
   */
  private async finalizeServerDeletion(serverId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const serverRepo = queryRunner.manager.getRepository(ServerEntity);
      const credentialRepo = queryRunner.manager.getRepository(
        ServerSshCredentialEntity,
      );

      if (this.sshManager.isConnected(serverId)) {
        this.sshManager.disconnect(serverId);
      }

      const currentTime = dayjs().unix();

      await serverRepo.update(
        { id: serverId },
        {
          status: EntityStatus.INACTIVE,
          deletedAt: currentTime,
          metadata: null,
        },
      );

      await credentialRepo.update(
        { serverId },
        {
          status: EntityStatus.INACTIVE,
          deletedAt: currentTime,
        },
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Runs the server deletion process asynchronously.
   *
   * After removing the remote agent, releases the self-host SSH reverse tunnel when
   * no other active servers share the same host ({@link AgentSocketTunnelService.releaseIfHostUnused}).
   *
   * @param userId - Owner of the server being deleted.
   * @param serverId - Server UUID to delete.
   * @param options.removeManagedServices - When true, purge deployments on the host via agent.
   */
  private runServerDeletionAsync(
    userId: string,
    serverId: string,
    options?: { removeManagedServices?: boolean },
  ): void {
    void (async () => {
      const removeManagedServices = options?.removeManagedServices === true;

      try {
        await this.deploymentsService.deactivateDeploymentsForServerDeletion(
          serverId,
          userId,
          { removeManagedServices },
        );

        const hostForTunnel = await this.serverRepository.findOne({
          where: { id: serverId },
          select: { id: true, host: true },
        });

        await this.removeAgentFromRemoteServer(serverId);
        await this.finalizeServerDeletion(serverId);
        if (hostForTunnel?.host) {
          await this.agentSocketTunnel.releaseIfHostUnused(
            hostForTunnel.host,
            serverId,
          );
        }
        this.notifyServerOperationUpdated(serverId, null, { deleted: true });
      } catch (error) {
        this.logger.error(
          `Background server deletion failed for server '${serverId}': ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        await this.setServerOperationStatus(
          serverId,
          SERVER_OPERATION_STATUS.ERROR,
          error instanceof Error
            ? error.message
            : ERROR_MESSAGES.SERVER.DELETE_FAILED,
        );
      }
    })();
  }

  private async getOwnedServer(
    userId: string,
    id: string,
  ): Promise<ServerEntity> {
    const server = await this.serverRepository.findOne({
      where: {
        id,
        userId,
        status: EntityStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });

    if (!server) {
      throw new NotFoundException(ERROR_MESSAGES.SERVER.NOT_FOUND);
    }

    return server;
  }

  private async getServerConnectionOptions(userId: string, id: string) {
    const server = await this.getOwnedServer(userId, id);

    const credential = await this.credentialRepository.findOne({
      where: { serverId: id },
    });

    if (!credential) {
      throw new NotFoundException(ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND);
    }

    return {
      serverId: id,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: credential.authType,
      encryptedPassword: credential.encryptedPassword,
      encryptedPrivateKey: credential.encryptedPrivateKey,
      privateKeyPassphrase: credential.privateKeyPassphrase,
    };
  }

  /**
   * find exisiting server
   * @param input
   * @returns
   */
  private async findExistingServer(
    input: ExistingServerCheck,
  ): Promise<ServerEntity | null> {
    const matches = await this.serverRepository.find({
      where: {
        host: input.host,
        userId: input.userId,
      },
    });

    if (matches.length === 0) {
      return null;
    }

    const active = matches.find(
      (server) => server.status === EntityStatus.ACTIVE && !server.deletedAt,
    );
    if (active) {
      return active;
    }

    return (
      matches.find(
        (server) =>
          server.status === EntityStatus.INACTIVE && !!server.deletedAt,
      ) ?? matches[0]
    );
  }

  /**
   * restore from soft delete
   * @param serverId
   * @returns
   */
  private async restoreServer(
    serverId: string,
    updates?: { name?: string },
  ): Promise<ServerSshCredentialEntity | null> {
    const patch: {
      status: EntityStatus;
      deletedAt: null;
      name?: string;
    } = {
      status: EntityStatus.ACTIVE,
      deletedAt: null,
    };

    const trimmedName = updates?.name?.trim();
    if (trimmedName) {
      patch.name = trimmedName;
    }

    await this.serverRepository.update({ id: serverId }, patch);

    await this.credentialRepository.update(
      { serverId },
      {
        status: EntityStatus.ACTIVE,
        deletedAt: null,
      },
    );

    return this.credentialRepository.findOne({
      where: { serverId, status: EntityStatus.ACTIVE },
    });
  }

  private async updateInactiveCredentialFromInput(
    credentialId: string,
    ssh: CreateServerSshCredentialRequestDto,
  ): Promise<void> {
    const encrypted = encryptCredentialFields(this.encryptionService, ssh);

    await this.credentialRepository.update(
      { id: credentialId },
      {
        authType: ssh.authType,
        encryptedPassword: encrypted.encryptedPassword,
        encryptedPrivateKey: encrypted.encryptedPrivateKey,
        privateKeyPassphrase: encrypted.encryptedPassphrase,
        sshFingerprint: ssh.sshFingerprint ?? null,
      },
    );
  }

  private throwOnboardFailure(params: OnboardFailureParams): never {
    throw new OperationFailedException(
      params.message,
      params.error,
      HttpStatus.BAD_REQUEST,
      { errorCode: params.code },
    );
  }

  private async assertOnboardSshConnection(
    server: OnboardSshServerInfo,
    ssh: CreateServerSshCredentialRequestDto,
    options?: { releaseConnectionAfterSuccess?: boolean },
  ): Promise<void> {
    const result = await runSshHealthTestWithTimeout(
      this.health,
      buildOnboardSshTestOptions(this.encryptionService, server, ssh),
    );

    if (!result.success) {
      this.sshManager.disconnect(server.id);
      this.throwOnboardFailure({
        message: ERROR_MESSAGES.SERVER.SSH_CONNECTION_FAILED,
        error: result.message || ERROR_MESSAGES.SERVER.SSH_TEST_FAILED,
        code: result.code ?? mapSshTestErrorCode(result.message),
      });
    }

    if (options?.releaseConnectionAfterSuccess) {
      this.sshManager.disconnect(server.id);
    }
  }

  private requireOnboardSshPayload(
    ssh: CreateServerSshCredentialRequestDto | undefined,
  ): CreateServerSshCredentialRequestDto {
    if (!ssh) {
      throw new BadRequestException(ERROR_MESSAGES.SERVER.SSH_PAYLOAD_REQUIRED);
    }

    return ssh;
  }

  private async restoreDeletedServer(
    existingServer: ServerEntity,
    input: CreateServerOnboardRequestDto,
  ): Promise<ServiceResponse<OnboardSuccessData>> {
    const credential = await this.credentialRepository.findOne({
      where: {
        serverId: existingServer.id,
        status: EntityStatus.INACTIVE,
      },
    });

    if (!credential) {
      this.throwOnboardFailure({
        message: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
        error: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
        code: ServerErrorCode.CREDENTIALS_NOT_FOUND,
      });
    }

    const ssh = this.requireOnboardSshPayload(input.ssh);
    assertOnboardSshInput(ssh);

    await this.assertOnboardSshConnection(existingServer, ssh);

    await this.updateInactiveCredentialFromInput(credential.id, ssh);

    const restoredCredential = await this.restoreServer(existingServer.id, {
      name: input.server.name,
    });

    if (!restoredCredential) {
      this.throwOnboardFailure({
        message: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
        error: ERROR_MESSAGES.SERVER.CREDENTIALS_NOT_FOUND,
        code: ServerErrorCode.CREDENTIALS_NOT_FOUND,
      });
    }

    const restoreLogs: string[] = [SERVER_ONBOARD_LOGS.DELETED_SERVER_RESTORED];

    if (this.shouldInstallAgent(input.installAgent)) {
      await this.setServerOperationStatus(
        existingServer.id,
        SERVER_OPERATION_STATUS.STARTING,
      );
    }

    this.runAgentInstallAfterOnboardAsync({
      installAgent: input.installAgent,
      server: existingServer,
      credential: restoredCredential,
      plainPrivateKey: ssh.privateKey,
      logs: restoreLogs,
    });

    return {
      message: SUCCESS_MESSAGES.SERVER.RESTORED,
      data: {
        serverId: existingServer.id,
        sshCredentialId: restoredCredential.id,
        sshTest: { success: true },
        agentInstall: this.buildPendingAgentInstallResponse(input.installAgent),
      },
    };
  }

  /**
   * create the server
   * @param input
   * @returns
   */
  async onboardServer(
    userId: string,
    input: CreateServerOnboardRequestDto,
  ): Promise<ServiceResponse<OnboardSuccessData>> {
    const existingServer = await this.findExistingServer({
      host: input.server.host,
      userId,
    });

    if (existingServer) {
      // Active server already exists
      if (
        existingServer.status === EntityStatus.ACTIVE &&
        !existingServer.deletedAt
      ) {
        throw new ConflictException(ERROR_MESSAGES.SERVER.ALREADY_EXIST);
      }

      // Previously deleted -> restore it
      if (
        existingServer.status === EntityStatus.INACTIVE &&
        existingServer.deletedAt
      ) {
        return this.restoreDeletedServer(existingServer, input);
      }
    }

    const logs: string[] = [];

    const ssh = this.requireOnboardSshPayload(input.ssh);
    assertOnboardSshInput(ssh);

    await this.assertOnboardSshConnection(
      buildOnboardServerConnectionInfo(
        input.server,
        ONBOARD_SSH_TEST_SERVER_ID,
      ),
      ssh,
      { releaseConnectionAfterSuccess: true },
    );

    logs.push(SERVER_ONBOARD_LOGS.SSH_CONNECTION_SUCCESS);
    logs.push(SERVER_ONBOARD_LOGS.VALIDATION_EXECUTED);

    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const serverRepo = queryRunner.manager.getRepository(ServerEntity);

      const credentialRepo = queryRunner.manager.getRepository(
        ServerSshCredentialEntity,
      );

      const serverPayload: CreateServerDto = input.server;

      const serverEntity = serverRepo.create({
        userId,
        name: serverPayload.name,
        host: serverPayload.host,
        port: serverPayload.port ?? DEFAULT_SSH_PORT,
        username: serverPayload.username,
        provider: serverPayload.provider ?? undefined,
        region: serverPayload.region ?? null,
        operatingSystem: serverPayload.operatingSystem ?? null,
        serverType: serverPayload.serverType ?? undefined,
        status: serverPayload.status ?? undefined,
        metadata: serverPayload.metadata ?? null,
      });

      const savedServer = await serverRepo.save(serverEntity);

      logs.push(SERVER_ONBOARD_LOGS.SERVER_CREATED);

      const { encryptedPassword, encryptedPrivateKey, encryptedPassphrase } =
        encryptCredentialFields(this.encryptionService, ssh);

      const credEntity = credentialRepo.create({
        userId,
        serverId: savedServer.id,
        authType: ssh.authType,
        encryptedPrivateKey: encryptedPrivateKey ?? null,
        privateKeyPassphrase: encryptedPassphrase ?? null,
        encryptedPassword: encryptedPassword ?? null,
        sshFingerprint: ssh.sshFingerprint ?? null,
        status: undefined,
        metadata: undefined,
      });

      const savedCredential = await credentialRepo.save(credEntity);

      logs.push(SERVER_ONBOARD_LOGS.SSH_CREDENTIALS_CREATED);

      await queryRunner.commitTransaction();

      await this.activityService.recordActivity({
        userId,
        serverId: savedServer.id,
        type: ActivityType.SERVER_ADDED,
        title: `Server added · ${savedServer.name}`,
        message: `Added ${savedServer.host}`,
        operationStatus: DeploymentStatus.SUCCESS,
      });

      if (this.shouldInstallAgent(input.installAgent)) {
        await this.setServerOperationStatus(
          savedServer.id,
          SERVER_OPERATION_STATUS.STARTING,
        );
      }

      this.runAgentInstallAfterOnboardAsync({
        installAgent: input.installAgent,
        server: savedServer,
        credential: savedCredential,
        plainPrivateKey: ssh.privateKey,
        logs,
      });

      return {
        message: SUCCESS_MESSAGES.SERVER.CREATED,
        data: {
          serverId: savedServer.id,
          sshCredentialId: savedCredential.id,
          sshTest: { success: true },
          agentInstall: this.buildPendingAgentInstallResponse(
            input.installAgent,
          ),
        },
      };
    } catch (err) {
      try {
        await queryRunner.rollbackTransaction();
      } catch (rollbackErr) {
        this.logger.warn(
          `rollback failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
        );
      }

      logs.push(SERVER_ONBOARD_LOGS.TRANSACTION_ROLLED_BACK);

      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        throw new ConflictException(ERROR_MESSAGES.SERVER.HOST_ALREADY_EXISTS);
      }

      if (err instanceof HttpException) {
        throw err;
      }

      throw new OperationFailedException(
        err instanceof Error
          ? err.message
          : ERROR_MESSAGES.SERVER.SSH_TEST_FAILED,
        err instanceof Error
          ? err.message
          : ERROR_MESSAGES.SERVER.SSH_TEST_FAILED,
        HttpStatus.BAD_REQUEST,
        { errorCode: ServerErrorCode.UNKNOWN_ERROR },
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * connec with the server
   * @param id
   * @returns
   */
  async connectServer(
    userId: string,
    id: string,
  ): Promise<ServiceResponse<{ connected: boolean }>> {
    try {
      const serverOptions = await this.getServerConnectionOptions(userId, id);

      if (this.sshManager.getConnection(id)) {
        throw new OperationFailedException(
          ERROR_MESSAGES.SERVER.ALREADY_CONNECTED,
          ERROR_MESSAGES.SERVER.ALREADY_CONNECTED,
          HttpStatus.CONFLICT,
          { errorCode: ServerErrorCode.ALREADY_CONNECTED },
        );
      }

      try {
        await this.sshManager.connect(serverOptions);
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }

        throw new OperationFailedException(
          ERROR_MESSAGES.SERVER.CONNECTION_FAILED,
          error instanceof Error
            ? error.message
            : ERROR_MESSAGES.SERVER.CONNECTION_FAILED,
          HttpStatus.BAD_REQUEST,
          { errorCode: ServerErrorCode.CONNECTION_FAILED },
        );
      }

      await this.serverRepository.update(
        { id },
        { lastConnectedAt: dayjs().unix() },
      );

      return {
        message: SUCCESS_MESSAGES.SERVER.CONNECTED,
        data: { connected: true },
      };
    } catch (error) {
      this.logger.error(
        `Connect server '${id}' failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * disconnect with the server
   * @param id
   * @returns
   */
  async disconnectServer(
    userId: string,
    id: string,
  ): Promise<ServiceResponse<{ connected: boolean }>> {
    try {
      await this.getServerConnectionOptions(userId, id);
      this.sshManager.disconnect(id);

      return {
        message: SUCCESS_MESSAGES.SERVER.DISCONNECTED,
        data: { connected: false },
      };
    } catch (error) {
      this.logger.error(
        `Disconnect server '${id}' failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * soft delete server
   * @param id
   * @returns
   */
  async deleteServer(
    userId: string,
    id: string,
    options?: { removeManagedServices?: boolean },
  ): Promise<ServiceResponse<DeleteServerResponseDto>> {
    try {
      const server = await this.serverRepository.findOne({
        where: { id, userId, deletedAt: IsNull() },
      });

      if (!server) {
        throw new NotFoundException(ERROR_MESSAGES.SERVER.NOT_FOUND);
      }

      const { operationStatus } = readServerOperationFromMetadata(
        server.metadata,
      );

      if (operationStatus === SERVER_OPERATION_STATUS.REMOVING) {
        return {
          message: SUCCESS_MESSAGES.SERVER.DELETE_STARTED,
          data: { deleted: false, pending: true },
        };
      }

      if (operationStatus === SERVER_OPERATION_STATUS.STARTING) {
        throw new ConflictException(
          ERROR_MESSAGES.SERVER.OPERATION_IN_PROGRESS,
        );
      }

      await this.setServerOperationStatus(id, SERVER_OPERATION_STATUS.REMOVING);

      await this.activityService.recordActivity({
        userId,
        serverId: id,
        type: ActivityType.SERVER_DELETED,
        title: `Server deleted · ${server.name}`,
        message: `Deleting ${server.host}`,
        operationStatus: DeploymentStatus.REMOVING,
      });

      this.runServerDeletionAsync(userId, id, options);

      return {
        message: SUCCESS_MESSAGES.SERVER.DELETE_STARTED,
        data: { deleted: false, pending: true },
      };
    } catch (error) {
      this.logger.error(`Failed to delete server ${id}: ${String(error)}`);
      throw error;
    }
  }

  /**
   * List servers with pagination, filtering, and search.
   */
  async listServers(
    userId: string,
    query: ListServersQueryDto,
  ): Promise<ServiceResponse<PaginatedResponse<ServerResponseDto>>> {
    try {
      const page = query.page ?? DEFAULT_LIST_PAGE;
      const limit = query.limit ?? DEFAULT_LIST_LIMIT;
      const skip = (page - 1) * limit;
      const sortBy = query.sortBy ?? DEFAULT_LIST_SORT_BY;
      const sortOrder = (
        query.sortOrder ?? DEFAULT_LIST_SORT_ORDER
      ).toUpperCase() as "ASC" | "DESC";

      const connectedIds = this.sshManager.getConnectedServerIds();

      const where: FindOptionsWhere<ServerEntity> = {
        userId,
        deletedAt: IsNull(),
        status: query.status ?? EntityStatus.ACTIVE,
      };

      if (query.provider) {
        where.provider = query.provider;
      }

      if (query.serverType) {
        where.serverType = query.serverType;
      }

      if (query.connected === true) {
        if (connectedIds.length === 0) {
          return {
            message: SUCCESS_MESSAGES.SERVER.LIST,
            data: {
              data: [],
              pagination: {
                page,
                limit,
                total: 0,
                totalPages: 0,
              },
            },
          };
        }

        where.id = In(connectedIds);
      }

      if (query.connected === false && connectedIds.length > 0) {
        where.id = Not(In(connectedIds));
      }

      let searchWhere: FindOptionsWhere<ServerEntity>[] | undefined;

      if (query.search?.trim()) {
        const searchTerm = query.search.trim();
        const search = ILike(`%${searchTerm}%`);

        searchWhere = [
          {
            ...where,
            name: search,
          },
          {
            ...where,
            host: search,
          },
          {
            ...where,
            username: search,
          },
        ];

        const searchValue = String(query.search);

        if (isUUID(searchValue)) {
          searchWhere.push({
            ...where,
            id: searchValue,
          });
        }
      }

      const [servers, total] = await this.serverRepository.findAndCount({
        where: searchWhere ?? where,
        order: {
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      });

      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

      return {
        message: SUCCESS_MESSAGES.SERVER.LIST,
        data: {
          data: servers.map((server) =>
            toServerResponseDto(server, this.sshManager, (id) =>
              this.deploymentGateway.isAgentConnectedForServer(id),
            ),
          ),
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        },
      };
    } catch (error) {
      this.logger.error(`List servers failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Get a single server owned by the authenticated user.
   */
  async getServerById(
    userId: string,
    id: string,
  ): Promise<ServiceResponse<ServerResponseDto>> {
    try {
      const server = await this.getOwnedServer(userId, id);

      return {
        message: SUCCESS_MESSAGES.SERVER.FETCHED,
        data: toServerResponseDto(server, this.sshManager, (id) =>
          this.deploymentGateway.isAgentConnectedForServer(id),
        ),
      };
    } catch (error) {
      this.logger.error(`Get server '${id}' failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Update server name for the authenticated user.
   */
  async updateServer(
    userId: string,
    id: string,
    input: UpdateServerDto,
  ): Promise<ServiceResponse<ServerResponseDto>> {
    try {
      const server = await this.getOwnedServer(userId, id);

      await this.serverRepository.update(
        { id: server.id },
        { name: input.name },
      );

      return {
        message: SUCCESS_MESSAGES.SERVER.UPDATED,
        data: toServerResponseDto(server, this.sshManager, (serverId) =>
          this.deploymentGateway.isAgentConnectedForServer(serverId),
        ),
      };
    } catch (error) {
      this.logger.error(
        `Update server '${id}' failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * find one
   * @param options
   * @returns
   */
  async findOne(options: FindOneOptions<ServerEntity>) {
    try {
      return await this.serverRepository.findOne(options);
    } catch (error) {
      this.logger.error(`Find server failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Checks agent WebSocket health for the next active server in rotation.
   * Updates health columns, applies grace thresholds, and may trigger background recovery.
   * Processes exactly one server per invocation; never runs checks in parallel.
   *
   * @returns Result indicating which server was checked and whether recovery was triggered.
   */
  async processAgentHealthCheck(): Promise<AgentHealthCronResult> {
    if (this.agentHealthCheckInProgress) {
      return { processed: false };
    }

    this.agentHealthCheckInProgress = true;

    try {
      const server = await this.selectNextServerForHealthCheck();

      if (!server) {
        return { processed: false };
      }

      const checkedAt = dayjs().unix();
      const isConnected = this.deploymentGateway.isAgentConnectedForServer(
        server.id,
      );

      if (isConnected) {
        await this.serverRepository.update(server.id, {
          isServerUp: true,
          lastAgentCheckedAt: checkedAt,
          retryCount: 0,
          agentError: null,
        });

        return {
          processed: true,
          serverId: server.id,
          connected: true,
        };
      }

      const nextRetryCount = server.retryCount + 1;
      let agentContainersSummary = "no agent container found";
      let hasRunningAgentContainer = false;

      try {
        const agentContainers = await this.findAgentContainersOnHost(server.id);
        hasRunningAgentContainer = agentContainers.some((container) =>
          this.isDockerContainerRunning(container.status),
        );
        if (agentContainers.length > 0) {
          agentContainersSummary = agentContainers
            .map(
              (container) =>
                `${container.containerName} (${container.status || "unknown"})`,
            )
            .join(", ");
        }
      } catch (error) {
        agentContainersSummary = `container discovery failed: ${toErrorMessage(error)}`;
      }

      const shouldRecover =
        !hasRunningAgentContainer &&
        nextRetryCount >= 5 &&
        !this.isRecoveryInProgress(server.agentError);

      const agentError: ServerAgentError = {
        message: shouldRecover
          ? `Agent WebSocket is not connected (${agentContainersSummary})`
          : `Agent WebSocket is not connected — waiting before recovery (${agentContainersSummary})`,
        serverId: server.id,
        host: server.host,
        checkedAt,
        retryCount: nextRetryCount,
        recoveryInProgress: server.agentError?.recoveryInProgress,
      };

      await this.serverRepository.update(server.id, {
        isServerUp: false,
        lastAgentCheckedAt: checkedAt,
        retryCount: nextRetryCount,
        agentError,
      });

      if (shouldRecover) {
        this.triggerAgentRecoveryAsync(server.id);
      }

      return {
        processed: true,
        serverId: server.id,
        connected: false,
        recoveryTriggered: shouldRecover,
      };
    } catch (error) {
      this.logger.error(`Agent health check failed: ${toErrorMessage(error)}`);
      throw error;
    } finally {
      this.agentHealthCheckInProgress = false;
    }
  }

  /**
   * Starts recoverAgentForServer() in the background without awaiting completion.
   *
   * @param serverId - Server to recover.
   */
  private triggerAgentRecoveryAsync(serverId: string): void {
    void (async () => {
      try {
        const result = await this.recoverAgentForServer(serverId);

        if (!result.success) {
          logStructured(
            this.logger,
            "warn",
            "agent.recovery.background",
            "failed",
            {
              module: "ServerConnectionsService",
              serverId,
              error: result.error ?? "unknown error",
            },
          );
        }
      } catch (error) {
        logStructuredError(this.logger, "agent.recovery.background", error, {
          module: "ServerConnectionsService",
          serverId,
        });
      }
    })();
  }

  /**
   * Picks the active server checked least recently (fair rotation persisted via lastAgentCheckedAt).
   *
   * @returns Next server to health-check, or null when no active servers exist.
   */
  private async selectNextServerForHealthCheck(): Promise<{
    id: string;
    host: string;
    retryCount: number;
    agentError: ServerAgentError | null;
  } | null> {
    const healthSelect = {
      id: true,
      host: true,
      retryCount: true,
      agentError: true,
    } as const;
    const activeWhere = {
      status: EntityStatus.ACTIVE,
      deletedAt: IsNull(),
    };

    const neverChecked = await this.serverRepository.findOne({
      where: { ...activeWhere, lastAgentCheckedAt: IsNull() },
      order: { id: "ASC" },
      select: healthSelect,
    });

    if (neverChecked) {
      return neverChecked;
    }

    return this.serverRepository.findOne({
      where: activeWhere,
      order: { lastAgentCheckedAt: "ASC", id: "ASC" },
      select: healthSelect,
    });
  }

  /**
   * True when a recovery is marked in progress and not stale (10 minutes).
   *
   * @param agentError - Persisted agent error payload for the server.
   */
  private isRecoveryInProgress(agentError: ServerAgentError | null): boolean {
    if (!agentError?.recoveryInProgress) {
      return false;
    }

    return dayjs().unix() - agentError.checkedAt < 600;
  }

  /**
   * Updates recoveryInProgress on the persisted agentError jsonb (no new DB columns).
   *
   * @param serverId - Server row to update.
   * @param inProgress - Whether recovery is currently running.
   */
  private async setRecoveryInProgress(
    serverId: string,
    inProgress: boolean,
  ): Promise<void> {
    try {
      const server = await this.serverRepository.findOne({
        where: { id: serverId },
        select: { id: true, agentError: true },
      });

      if (!server?.agentError) {
        return;
      }

      await this.serverRepository.update(serverId, {
        agentError: {
          ...server.agentError,
          recoveryInProgress: inProgress,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update recoveryInProgress for server '${serverId}': ${toErrorMessage(error)}`,
      );
    }
  }

  /**
   * Lists kubeara-agent containers on the server host (canonical and compose-prefixed).
   *
   * @param serverId - Server to query via SSH or local shell.
   * @returns Containers whose name matches kubeara-agent patterns.
   */
  private async findAgentContainersOnHost(
    serverId: string,
  ): Promise<DiscoveredContainerPayload[]> {
    try {
      const containers = await this.discoverContainersOnHost(serverId);
      return containers.filter((container) =>
        this.isKubearaAgentContainerName(container.containerName),
      );
    } catch (error) {
      this.logger.error(
        `Find agent containers failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Matches canonical and compose-prefixed kubeara-agent container names.
   *
   * @param containerName - Docker container name (with or without leading slash).
   * @returns True when the name refers to a kubeara agent container.
   */
  private isKubearaAgentContainerName(containerName: string): boolean {
    const normalized = containerName.replace(/^\//, "").toLowerCase();
    const agentName = AGENT_INSTALL.CONTAINER_NAME.toLowerCase();

    return (
      normalized === agentName ||
      normalized.endsWith(`_${agentName}`) ||
      normalized.includes(agentName)
    );
  }

  /**
   * True only for the canonical container name kubeara-agent (not compose-prefixed orphans).
   *
   * @param containerName - Docker container name (with or without leading slash).
   */
  private isCanonicalAgentContainerName(containerName: string): boolean {
    return (
      containerName.replace(/^\//, "").toLowerCase() ===
      AGENT_INSTALL.CONTAINER_NAME.toLowerCase()
    );
  }

  /**
   * True when docker ps status indicates the container can be started with docker start.
   * Excludes Created state, which requires remove + reinstall.
   *
   * @param status - Raw Status field from docker ps.
   */
  private isDockerContainerStartable(status: string): boolean {
    const normalized = status.trim().toLowerCase();

    return (
      normalized.includes("exited") ||
      normalized.includes("stopped") ||
      normalized.includes("paused")
    );
  }

  /**
   * True when docker ps status indicates a running container (starts with "Up").
   *
   * @param status - Raw Status field from docker ps.
   */
  private isDockerContainerRunning(status: string): boolean {
    return status.trim().toLowerCase().startsWith("up");
  }
}
