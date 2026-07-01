import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { ServerEntity } from "../../entities/server.entity";
import { ServerHealthError } from "../interfaces/server-health-error.interface";

export type ServerHealthSnapshot = Pick<
  ServerEntity,
  "id" | "metadata" | "retryCount"
>;

@Injectable()
export class ServerHealthRepository {
  private readonly logger = new Logger(ServerHealthRepository.name);
  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
  ) {}

  /**
   * Finds all active server IDs.
   * @returns A promise that resolves to an array of server IDs.
   */
  async findActiveServerIds(): Promise<string[]> {
    try {
      const servers = await this.serverRepository.find({
        where: {
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
        select: { id: true },
        order: { createdAt: "ASC" },
      });
  
      return servers.map((server) => server.id);
    } catch (error) {
      this.logger.error(
        `Failed to find active server IDs: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Finds a server health snapshot by server ID.
   * @param serverId - The ID of the server to find.
   * @returns A promise that resolves to a server health snapshot or null if not found.
   */
  async findServerHealthSnapshot(
    serverId: string,
  ): Promise<ServerHealthSnapshot | null> {
    try {
      return this.serverRepository.findOne({
        where: {
          id: serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
        select: { id: true, metadata: true, retryCount: true },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find server health snapshot for server ${serverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Records an agent unreachable error for a server.
   * @param serverId - The ID of the server to record the error for.
   * @param agentError - The error to record.
   * @returns A promise that resolves when the error is recorded.
   */
  async recordAgentUnreachable(
    serverId: string,
    agentError: ServerHealthError,
  ): Promise<void> {
    try {
      await this.serverRepository.update(
        { id: serverId },
        {
          isServerUp: false,
          agentError: { ...agentError },
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to record agent unreachable error for server ${serverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Increments the retry count for a server.
   * @param serverId - The ID of the server to increment the retry count for.
   * @returns A promise that resolves when the retry count is incremented.
   */
  async incrementRetryCount(serverId: string): Promise<void> {
    try {
      await this.serverRepository.increment({ id: serverId }, "retryCount", 1);
    } catch (error) {
      this.logger.error(
        `Failed to increment retry count for server ${serverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Marks a server as agent connected.
   * @param serverId - The ID of the server to mark as connected.
   * @param checkedAt - The timestamp of the check.
   * @returns A promise that resolves when the server is marked as connected.
   */
  async markAgentConnected(serverId: string, checkedAt: number): Promise<void> {
    try {
      await this.serverRepository.update(
        { id: serverId },
        {
          isServerUp: true,
          lastAgentCheckedAt: checkedAt,
          retryCount: 0,
          agentError: null,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to mark agent connected for server ${serverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Marks a server as agent disconnected.
   * @param serverId - The ID of the server to mark as disconnected.
   * @param agentError - The error to record.
   * @returns A promise that resolves when the server is marked as disconnected.
   */
  async markAgentDisconnected(
    serverId: string,
    agentError: ServerHealthError,
  ): Promise<void> {
    try {
      await this.incrementRetryCount(serverId);
      await this.recordAgentUnreachable(serverId, agentError);
    } catch (error) {
      this.logger.error(
        `Failed to mark agent disconnected for server ${serverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Updates the agent error for a server.
   * @param serverId - The ID of the server to update the agent error for.
   * @param agentError - The error to update.
   * @returns A promise that resolves when the agent error is updated.
   */
  async updateAgentError(
    serverId: string,
    agentError: ServerHealthError,
  ): Promise<void> {
    try {
      await this.serverRepository.update(
        { id: serverId },
        { agentError: { ...agentError } },
      );
    } catch (error) {
      this.logger.error(
        `Failed to update agent error for server ${serverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Updates the server error for a server.
   * @param serverId - The ID of the server to update the server error for.
   * @param serverError - The error to update.
   * @returns A promise that resolves when the server error is updated.
   */
  async updateServerError(
    serverId: string,
    serverError: ServerHealthError,
  ): Promise<void> {
    try {
      await this.serverRepository.update(
        { id: serverId },
        { serverError: { ...serverError } },
      );
    } catch (error) {
      this.logger.error(
        `Failed to update server error for server ${serverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
