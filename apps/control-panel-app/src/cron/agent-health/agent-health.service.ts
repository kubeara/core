import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { AgentHostStatus } from "@control-panel/modules/server-connections/interfaces/agent-host-status.interface";
import { ServerEntity } from "@control-panel/modules/server-connections/entities/server.entity";
import { ServerConnectionsService } from "@control-panel/modules/server-connections/services/server-connections.service";
import { IsNull, Repository } from "typeorm";
import {
  AGENT_HEALTH_CRON_INTERVAL,
  AGENT_PRESENT_NOT_CONNECTED_MESSAGE,
  AGENT_REMOVED_MESSAGE,
  AGENT_STOPPED_MESSAGE,
} from "./constants";
import { AgentHealthError } from "./types";

@Injectable()
export class AgentHealthService {
  private readonly logger = new Logger(AgentHealthService.name);

  private nextServerIndex = 0;
  private isRunning = false;
  private readonly recoveryInProgress = new Set<string>();

  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
    private readonly serverConnectionsService: ServerConnectionsService,
  ) {}

  @Cron(AGENT_HEALTH_CRON_INTERVAL)
  checkNextServerHealth(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    void this.runHealthCheckTick()
      .catch((error) => {
        this.logger.error(
          `Unexpected agent health cron failure: ${this.formatErrorMessage(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      })
      .finally(() => {
        this.isRunning = false;
      });
  }

  /**
   * Runs a health check tick for the next server.
   */
  private async runHealthCheckTick(): Promise<void> {
    const server = await this.pickNextServerToCheck();
    if (!server) {
      return;
    }

    this.logger.debug(`Checking agent health for server ${server.id}`);

    const hostStatus =
      await this.serverConnectionsService.getAgentHostStatus(server.id);

    switch (hostStatus.presence) {
      case "connected":
        await this.recordConnectedAgent(server);
        break;
      case "running":
        await this.recordAgentPresentNotConnected(server, hostStatus);
        break;
      case "stopped":
        await this.recordAgentStopped(server, hostStatus);
        this.startAgentContainerInBackground(server.id, hostStatus.containerId!);
        break;
      case "missing":
        await this.recordAgentRemoved(server);
        this.startAgentInstallInBackground(server.id);
        break;
    }

    this.nextServerIndex += 1;
  }

  /**
   * Picks the next server to check.
   */
  private async pickNextServerToCheck(): Promise<ServerEntity | null> {
    let server = await this.findActiveServerAtIndex(this.nextServerIndex);

    if (!server && this.nextServerIndex > 0) {
      this.nextServerIndex = 0;
      server = await this.findActiveServerAtIndex(0);
    }

    if (!server) {
      this.nextServerIndex = 0;
    }

    return server;
  }

  /**
   * Finds the active server at the given index.
   */
  private async findActiveServerAtIndex(
    index: number,
  ): Promise<ServerEntity | null> {
    const servers = await this.serverRepository.find({
      where: {
        status: EntityStatus.ACTIVE,
        deletedAt: IsNull(),
      },
      order: {
        createdAt: "ASC",
        id: "ASC",
      },
      skip: index,
      take: 1,
    });

    return servers[0] ?? null;
  }

  /**
   * Starts an agent installation in the background.
   */
  private startAgentInstallInBackground(serverId: string): void {
    if (this.recoveryInProgress.has(serverId)) {
      this.logger.debug(
        `Agent recovery already running for server ${serverId}; skipping install`,
      );
      return;
    }

    this.recoveryInProgress.add(serverId);
    this.logger.log(`Agent installation triggered for server ${serverId}`);

    void this.serverConnectionsService
      .ensureAgentInstalledForServer(serverId)
      .finally(() => {
        this.recoveryInProgress.delete(serverId);
      })
      .catch((error) => {
        this.logger.error(
          `Background agent installation failed for server ${serverId}: ${this.formatErrorMessage(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      });
  }

  /**
   * Starts an agent container in the background.
   */
  private startAgentContainerInBackground(
    serverId: string,
    containerId: string,
  ): void {
    if (this.recoveryInProgress.has(serverId)) {
      this.logger.debug(
        `Agent recovery already running for server ${serverId}; skipping start`,
      );
      return;
    }

    this.recoveryInProgress.add(serverId);
    this.logger.log(`Agent container start triggered for server ${serverId}`);

    void this.serverConnectionsService
      .startAgentContainerOnHost(serverId, containerId)
      .finally(() => {
        this.recoveryInProgress.delete(serverId);
      })
      .catch((error) => {
        this.logger.error(
          `Background agent container start failed for server ${serverId}: ${this.formatErrorMessage(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      });
  }

  /**
   * Records a connected agent.
   */
  private async recordConnectedAgent(server: ServerEntity): Promise<void> {
    this.recoveryInProgress.delete(server.id);

    const now = Date.now();
    const wasRecovering = server.retryCount > 0 || server.agentError !== null;

    if (wasRecovering) {
      this.logger.log(`Agent connected for server ${server.id}`);
    } else {
      this.logger.debug(`Agent connected for server ${server.id}`);
    }

    const needsUpdate =
      server.lastAgentCheckedAt !== now ||
      server.retryCount !== 0 ||
      server.agentError !== null;

    if (!needsUpdate) {
      return;
    }

    server.lastAgentCheckedAt = now;
    server.retryCount = 0;
    server.agentError = null;
    await this.serverRepository.save(server);
  }

  /**
   * Records a present agent that is not connected.
   */
  private async recordAgentPresentNotConnected(
    server: ServerEntity,
    hostStatus: AgentHostStatus,
  ): Promise<void> {
    this.logger.debug(
      `Agent present on host for server ${server.id}; skipping install (${hostStatus.containerStatus})`,
    );

    await this.saveAgentHealthState(server, {
      message: AGENT_PRESENT_NOT_CONNECTED_MESSAGE,
      serverId: server.id,
      containerId: hostStatus.containerId,
      containerStatus: hostStatus.containerStatus,
    });
  }

  /**
   * Records a stopped agent.
   */
  private async recordAgentStopped(
    server: ServerEntity,
    hostStatus: AgentHostStatus,
  ): Promise<void> {
    this.logger.warn(
      `Agent stopped on host for server ${server.id} (${hostStatus.containerStatus})`,
    );

    await this.saveAgentHealthState(server, {
      message: AGENT_STOPPED_MESSAGE,
      serverId: server.id,
      containerId: hostStatus.containerId,
      containerStatus: hostStatus.containerStatus,
    });
  }

  /**
   * Records a removed agent.
   */
  private async recordAgentRemoved(server: ServerEntity): Promise<void> {
    this.logger.warn(`Agent removed or missing on host for server ${server.id}`);

    await this.saveAgentHealthState(server, {
      message: AGENT_REMOVED_MESSAGE,
      serverId: server.id,
    });
  }

  /**
   * Saves the agent health state.
   */
  private async saveAgentHealthState(
    server: ServerEntity,
    errorFields: Omit<AgentHealthError, "timestamp">,
  ): Promise<void> {
    server.retryCount += 1;
    server.agentError = {
      ...errorFields,
      timestamp: Date.now(),
    };
    await this.serverRepository.save(server);
  }

  private formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
