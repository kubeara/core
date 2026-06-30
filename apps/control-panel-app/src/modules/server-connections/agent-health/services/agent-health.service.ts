import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";

import { DeploymentGateway } from "@control-panel/websocket/websocket.gateway";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { ServerConnectionsService } from "../../services/server-connections.service";
import { AGENT_HEALTH } from "../constants/agent-health.constants";
import { ServerHealthError } from "../interfaces/server-health-error.interface";
import { ServerHealthRepository } from "../repositories/server-health.repository";

@Injectable()
export class AgentHealthService {
  private readonly logger = new Logger(AgentHealthService.name);
  private readonly runningAgentInstallations = new Set<string>();
  private readonly lastInstallAttemptAt = new Map<string, number>();
  private currentServerIndex = 0;

  constructor(
    private readonly serverHealthRepository: ServerHealthRepository,
    @Optional()
    @Inject(forwardRef(() => DeploymentGateway))
    private readonly deploymentGateway: DeploymentGateway | null,
    @Optional()
    @Inject(forwardRef(() => ServerConnectionsService))
    private readonly serverConnectionsService: ServerConnectionsService | null,
  ) {}

  /**
   * Checks if an installation is running for a server.
   * @param serverId - The ID of the server to check.
   * @returns True if an installation is running, false otherwise.
   */
  isInstallationRunning(serverId: string): boolean {
    return this.runningAgentInstallations.has(serverId);
  }

  /**
   * Processes the next server in the list of active servers.
   * @returns A promise that resolves when the server is processed.
   */
  async processNextServer(): Promise<void> {
    const activeServerIds =
      await this.serverHealthRepository.findActiveServerIds();

    if (activeServerIds.length === 0) {
      return;
    }

    const serverId =
      activeServerIds[this.currentServerIndex % activeServerIds.length];
    this.currentServerIndex =
      (this.currentServerIndex + 1) % Number.MAX_SAFE_INTEGER;

    try {
      await this.checkServer(serverId);
    } catch (error) {
      this.logger.error(
        `${AGENT_HEALTH.LOG_PREFIX} Failed checking server: ${serverId} — ${toErrorMessage(error)}`,
      );

      try {
        await this.serverHealthRepository.updateServerError(serverId, {
          message: toErrorMessage(error),
          timestamp: Date.now(),
        });
      } catch (updateError) {
        this.logger.error(
          `${AGENT_HEALTH.LOG_PREFIX} Failed to persist server error for '${serverId}': ${toErrorMessage(updateError)}`,
        );
      }
    }
  }

  /**
   * Checks the health of a server.
   * @param serverId - The ID of the server to check.
   * @returns A promise that resolves when the server is checked.
   */
  async checkServer(serverId: string): Promise<void> {
    this.logger.log(`${AGENT_HEALTH.LOG_PREFIX} Checking server: ${serverId}`);

    if (!this.isConnectionCheckerAvailable()) {
      this.logger.error(
        `${AGENT_HEALTH.LOG_PREFIX} Agent connection checker unavailable, skipping server: ${serverId}`,
      );
      return;
    }

    if (this.deploymentGateway!.isAgentConnectedForServer(serverId)) {
      await this.serverHealthRepository.markAgentConnected(
        serverId,
        Date.now(),
      );
      this.logger.log(
        `${AGENT_HEALTH.LOG_PREFIX} Agent connected: ${serverId}`,
      );
      return;
    }

    const agentError: ServerHealthError = {
      message: AGENT_HEALTH.AGENT_DISCONNECTED_MESSAGE,
      timestamp: Date.now(),
    };

    await this.serverHealthRepository.recordAgentUnreachable(
      serverId,
      agentError,
    );

    const shouldInstall = await this.shouldAttemptCronInstall(serverId);
    if (!shouldInstall.attempt) {
      if (shouldInstall.reason) {
        this.logger.log(
          `${AGENT_HEALTH.LOG_PREFIX} Skipping installation for ${serverId}: ${shouldInstall.reason}`,
        );
      }
      return;
    }

    this.logger.log(
      `${AGENT_HEALTH.LOG_PREFIX} Agent disconnected, starting installation: ${serverId}`,
    );

    this.triggerAgentInstallation(serverId);
  }

  /**
   * Triggers an agent installation for a server.
   * @param serverId - The ID of the server to install the agent for.
   */
  triggerAgentInstallation(serverId: string): void {
    if (!this.isInstallServiceAvailable()) {
      this.logger.error(
        `${AGENT_HEALTH.LOG_PREFIX} Agent install service unavailable, skipping installation: ${serverId}`,
      );
      return;
    }

    if (this.runningAgentInstallations.has(serverId)) {
      this.logger.log(
        `${AGENT_HEALTH.LOG_PREFIX} Installation already running: ${serverId}`,
      );
      return;
    }

    this.runningAgentInstallations.add(serverId);
    this.lastInstallAttemptAt.set(serverId, Date.now());

    void this.runAgentInstallation(serverId).catch((error) => {
      this.logger.error(
        `${AGENT_HEALTH.LOG_PREFIX} Background installation failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
    });
  }

  /**
   * Checks if a cron install should be attempted for a server.
   * @param serverId - The ID of the server to check.
   * @returns A promise that resolves to an object with the attempt and reason.
   */
  private async shouldAttemptCronInstall(
    serverId: string,
  ): Promise<{ attempt: boolean; reason?: string }> {
    if (this.runningAgentInstallations.has(serverId)) {
      return { attempt: false, reason: "installation already running" };
    }

    const lastAttempt = this.lastInstallAttemptAt.get(serverId);
    if (
      lastAttempt != null &&
      Date.now() - lastAttempt < AGENT_HEALTH.INSTALL_RETRY_INTERVAL_MS
    ) {
      return { attempt: false, reason: "install retry interval not elapsed" };
    }

    if (!this.isInstallServiceAvailable()) {
      return { attempt: false, reason: "install service unavailable" };
    }

    const busyCheck =
      await this.serverConnectionsService!.isServerBusyForHealthCronInstall(
        serverId,
      );
    if (busyCheck.busy) {
      return {
        attempt: false,
        reason: busyCheck.reason ?? "server operation in progress",
      };
    }

    return { attempt: true };
  }

  /**
   * Checks if the connection checker is available.
   * @returns True if the connection checker is available, false otherwise.
   */
  private isConnectionCheckerAvailable(): boolean {
    return (
      this.deploymentGateway != null &&
      typeof this.deploymentGateway.isAgentConnectedForServer === "function"
    );
  }

  /**
   * Checks if the install service is available.
   * @returns True if the install service is available, false otherwise.
   */
  private isInstallServiceAvailable(): boolean {
    return (
      this.serverConnectionsService != null &&
      typeof this.serverConnectionsService.ensureAgentInstalledForServer ===
        "function" &&
      typeof this.serverConnectionsService.isServerBusyForHealthCronInstall ===
        "function"
    );
  }

  /**
   * Runs an agent installation for a server.
   * @param serverId - The ID of the server to install the agent for.
   * @returns A promise that resolves when the installation is run.
   */
  private async runAgentInstallation(serverId: string): Promise<void> {
    try {
      const result =
        await this.serverConnectionsService!.ensureAgentInstalledForServer(
          serverId,
        );

      if (!result.success) {
        await this.serverHealthRepository.incrementRetryCount(serverId);
        await this.serverHealthRepository.updateAgentError(serverId, {
          message: result.error ?? "Agent installation failed",
          timestamp: Date.now(),
          details: { logs: result.logs },
        });
      }
    } catch (error) {
      await this.serverHealthRepository.incrementRetryCount(serverId);
      await this.serverHealthRepository.updateAgentError(serverId, {
        message: toErrorMessage(error),
        timestamp: Date.now(),
      });
    } finally {
      this.runningAgentInstallations.delete(serverId);
    }
  }
}
