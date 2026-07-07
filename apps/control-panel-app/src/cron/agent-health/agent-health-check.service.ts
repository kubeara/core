import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";

import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { ServerConnectionsService } from "@control-panel/modules/server-connections/services/server-connections.service";
import { DeploymentGateway } from "@control-panel/websocket/websocket.gateway";

import { AGENT_HEALTH } from "./constants/agent-health.constants";
import { ServerHealthError } from "./interfaces/server-health-error.interface";
import { ServerHealthRepository } from "./repositories/server-health.repository";

@Injectable()
export class AgentHealthCheckService {
  private readonly logger = new Logger(AgentHealthCheckService.name);
  private readonly runningAgentInstallations = new Set<string>();
  private readonly lastInstallAttemptAt = new Map<string, number>();

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
   */
  isInstallationRunning(serverId: string): boolean {
    return this.runningAgentInstallations.has(serverId);
  }

  /**
   * Checks the health of a server.
   */
  async checkServer(serverId: string): Promise<void> {
    try {
      this.logger.log(
        `${AGENT_HEALTH.LOG_PREFIX} Checking server: ${serverId}`,
      );

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
    } catch (error) {
      this.logger.error(
        `${AGENT_HEALTH.LOG_PREFIX} Failed checking server ${serverId}: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Triggers an agent installation for a server.
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
   * Checks if an agent installation should be attempted for a server.
   */
  private async shouldAttemptCronInstall(
    serverId: string,
  ): Promise<{ attempt: boolean; reason?: string }> {
    try {
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
    } catch (error) {
      this.logger.error(
        `${AGENT_HEALTH.LOG_PREFIX} Failed to evaluate cron install for server ${serverId}: ${toErrorMessage(error)}`,
      );
      return { attempt: false, reason: "install eligibility check failed" };
    }
  }

  /**
   * Checks if the connection checker is available.
   */
  private isConnectionCheckerAvailable(): boolean {
    return (
      this.deploymentGateway != null &&
      typeof this.deploymentGateway.isAgentConnectedForServer === "function"
    );
  }

  /**
   * Checks if the install service is available.
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
   */
  private async runAgentInstallation(serverId: string): Promise<void> {
    try {
      const result =
        await this.serverConnectionsService!.ensureAgentInstalledForServer(
          serverId,
        );

      if (!result.success) {
        await this.persistAgentInstallFailure(serverId, {
          message: result.error ?? "Agent installation failed",
          timestamp: Date.now(),
          details: { logs: result.logs },
        });
      }
    } catch (error) {
      this.logger.error(
        `${AGENT_HEALTH.LOG_PREFIX} Agent installation failed for server ${serverId}: ${toErrorMessage(error)}`,
      );

      await this.persistAgentInstallFailure(serverId, {
        message: toErrorMessage(error),
        timestamp: Date.now(),
      });
    } finally {
      this.runningAgentInstallations.delete(serverId);
    }
  }

  /**
   * Persists an agent installation failure.
   */
  private async persistAgentInstallFailure(
    serverId: string,
    agentError: ServerHealthError,
  ): Promise<void> {
    try {
      await this.serverHealthRepository.incrementRetryCount(serverId);
      await this.serverHealthRepository.updateAgentError(serverId, agentError);
    } catch (error) {
      this.logger.error(
        `${AGENT_HEALTH.LOG_PREFIX} Failed to persist agent install failure for server ${serverId}: ${toErrorMessage(error)}`,
      );
    }
  }
}
