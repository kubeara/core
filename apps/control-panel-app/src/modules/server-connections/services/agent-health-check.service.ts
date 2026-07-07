import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { IsNull, Repository } from "typeorm";

import { AGENT_HEALTH_MESSAGES } from "../constants/agent-health.constants";
import { ServerEntity } from "../entities/server.entity";
import {
  AgentHealthError,
  AgentHealthErrorInput,
} from "../interfaces/agent-health-error.interface";
import { AgentHealthTickResult } from "../interfaces/agent-health-tick-result.interface";
import { AgentHostPresence } from "../enums/agent-host-presence.enum";
import { AgentHostStatus } from "../interfaces/agent-host-status.interface";
import {
  agentHealthTimestampMs,
  updateServerAgentHealthFields,
} from "../utils/server-agent-health.util";
import { ServerConnectionsService } from "./server-connections.service";

@Injectable()
export class AgentHealthCheckService {
  private readonly logger = new Logger(AgentHealthCheckService.name);
  private nextServerIndex = 0;
  private readonly recoveryInProgress = new Set<string>();

  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
    private readonly serverConnectionsService: ServerConnectionsService,
  ) {}

  /**
   * Runs one agent health tick: selects the next active server, evaluates agent
   * presence, persists health fields, and triggers background recovery when needed.
   *
   * @returns The tick outcome including checked server id and host presence.
   */
  async runCronTick(): Promise<AgentHealthTickResult> {
    try {
      const server = await this.pickNextServerToCheck();
      if (!server) {
        return {
          serverId: null,
          presence: null,
          nextServerIndex: this.nextServerIndex,
        };
      }

      this.logger.debug(`Checking agent health for server ${server.id}`);

      const hostStatus = await this.serverConnectionsService.getAgentHostStatus(
        server.id,
      );

      switch (hostStatus.presence) {
        case AgentHostPresence.CONNECTED:
          await this.recordConnectedAgent(server);
          break;
        case AgentHostPresence.RUNNING:
          await this.recordAgentPresentNotConnected(server, hostStatus);
          break;
        case AgentHostPresence.STOPPED:
          await this.recordAgentStopped(server, hostStatus);
          this.triggerAgentContainerStart(server.id, hostStatus.containerId!);
          break;
        case AgentHostPresence.MISSING:
          await this.recordAgentRemoved(server);
          this.triggerAgentInstall(server.id);
          break;
      }

      this.nextServerIndex += 1;

      return {
        serverId: server.id,
        presence: hostStatus.presence,
        nextServerIndex: this.nextServerIndex,
      };
    } catch (error) {
      this.logger.error(
        `Agent health tick failed: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Selects the next active server using the in-memory round-robin index.
   *
   * @returns The server entity to check, or null when no active servers exist.
   */
  private async pickNextServerToCheck(): Promise<ServerEntity | null> {
    try {
      let server = await this.findActiveServerAtIndex(this.nextServerIndex);

      if (!server && this.nextServerIndex > 0) {
        this.nextServerIndex = 0;
        server = await this.findActiveServerAtIndex(0);
      }

      if (!server) {
        this.nextServerIndex = 0;
      }

      return server;
    } catch (error) {
      this.logger.error(
        `Failed to pick next server for agent health: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Loads one active server at the given list index ordered by creation time.
   *
   * @param index - Zero-based position in the active-server list.
   * @returns The server at that index, or null when out of range.
   */
  private async findActiveServerAtIndex(
    index: number,
  ): Promise<ServerEntity | null> {
    try {
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
    } catch (error) {
      this.logger.error(
        `Failed to load active server at index ${index}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Starts agent install recovery without blocking the caller.
   *
   * @param serverId - Target server UUID.
   * @returns void
   */
  private triggerAgentInstall(serverId: string): void {
    try {
      if (this.recoveryInProgress.has(serverId)) {
        this.logger.debug(
          `Agent recovery already running for server ${serverId}; skipping install`,
        );
        return;
      }

      this.recoveryInProgress.add(serverId);
      this.logger.log(`Agent installation triggered for server ${serverId}`);
      void this.runAgentInstallRecovery(serverId);
    } catch (error) {
      this.logger.error(
        `Failed to trigger agent install for server ${serverId}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Executes agent install recovery in the background.
   *
   * @param serverId - Target server UUID.
   * @returns Resolves when install attempt finishes.
   */
  private async runAgentInstallRecovery(serverId: string): Promise<void> {
    try {
      await this.serverConnectionsService.ensureAgentInstalledForServer(
        serverId,
      );
    } catch (error) {
      this.logger.error(
        `Background agent installation failed for server ${serverId}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.recoveryInProgress.delete(serverId);
    }
  }

  /**
   * Starts a stopped agent container without blocking the caller.
   *
   * @param serverId - Target server UUID.
   * @param containerId - Docker container id on the host.
   * @returns void
   */
  private triggerAgentContainerStart(
    serverId: string,
    containerId: string,
  ): void {
    try {
      if (this.recoveryInProgress.has(serverId)) {
        this.logger.debug(
          `Agent recovery already running for server ${serverId}; skipping start`,
        );
        return;
      }

      this.recoveryInProgress.add(serverId);
      this.logger.log(`Agent container start triggered for server ${serverId}`);
      void this.runAgentContainerStartRecovery(serverId, containerId);
    } catch (error) {
      this.logger.error(
        `Failed to trigger agent container start for server ${serverId}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Executes docker start recovery in the background.
   *
   * @param serverId - Target server UUID.
   * @param containerId - Docker container id on the host.
   * @returns Resolves when the start attempt finishes.
   */
  private async runAgentContainerStartRecovery(
    serverId: string,
    containerId: string,
  ): Promise<void> {
    try {
      await this.serverConnectionsService.startAgentContainerOnHost(
        serverId,
        containerId,
      );
    } catch (error) {
      this.logger.error(
        `Background agent container start failed for server ${serverId}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.recoveryInProgress.delete(serverId);
    }
  }

  /**
   * Persists a healthy connected agent state for a server.
   *
   * @param server - Server row loaded for the current tick.
   * @returns Resolves when persistence completes or is skipped.
   */
  private async recordConnectedAgent(server: ServerEntity): Promise<void> {
    try {
      this.recoveryInProgress.delete(server.id);

      const now = agentHealthTimestampMs();
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

      await updateServerAgentHealthFields(this.serverRepository, server.id, {
        lastAgentCheckedAt: now,
        retryCount: 0,
        agentError: null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record connected agent for server ${server.id}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Persists state when the agent container is running but the socket is down.
   *
   * @param server - Server row loaded for the current tick.
   * @param hostStatus - Host-level agent presence details.
   * @returns Resolves when persistence completes.
   */
  private async recordAgentPresentNotConnected(
    server: ServerEntity,
    hostStatus: AgentHostStatus,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Agent present on host for server ${server.id}; skipping install (${hostStatus.containerStatus})`,
      );

      await this.persistAgentHealthError(server, {
        message: AGENT_HEALTH_MESSAGES.PRESENT_NOT_CONNECTED,
        serverId: server.id,
        containerId: hostStatus.containerId,
        containerStatus: hostStatus.containerStatus,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record present-but-disconnected agent for server ${server.id}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Persists state when the agent container exists but is stopped.
   *
   * @param server - Server row loaded for the current tick.
   * @param hostStatus - Host-level agent presence details.
   * @returns Resolves when persistence completes.
   */
  private async recordAgentStopped(
    server: ServerEntity,
    hostStatus: AgentHostStatus,
  ): Promise<void> {
    try {
      this.logger.warn(
        `Agent stopped on host for server ${server.id} (${hostStatus.containerStatus})`,
      );

      await this.persistAgentHealthError(server, {
        message: AGENT_HEALTH_MESSAGES.STOPPED,
        serverId: server.id,
        containerId: hostStatus.containerId,
        containerStatus: hostStatus.containerStatus,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record stopped agent for server ${server.id}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Persists state when the agent container is missing on the host.
   *
   * @param server - Server row loaded for the current tick.
   * @returns Resolves when persistence completes.
   */
  private async recordAgentRemoved(server: ServerEntity): Promise<void> {
    try {
      this.logger.warn(
        `Agent removed or missing on host for server ${server.id}`,
      );

      await this.persistAgentHealthError(server, {
        message: AGENT_HEALTH_MESSAGES.REMOVED,
        serverId: server.id,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record removed agent for server ${server.id}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Increments retry count and stores structured agent error details.
   *
   * @param server - Server row loaded for the current tick.
   * @param errorFields - Agent error payload without timestamp.
   * @returns Resolves when persistence completes.
   */
  private async persistAgentHealthError(
    server: ServerEntity,
    errorFields: AgentHealthErrorInput,
  ): Promise<void> {
    try {
      const agentError: AgentHealthError = {
        ...errorFields,
        timestamp: agentHealthTimestampMs(),
      };

      await updateServerAgentHealthFields(this.serverRepository, server.id, {
        retryCount: server.retryCount + 1,
        agentError,
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist agent health error for server ${server.id}: ${toErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
