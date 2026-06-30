import { Injectable } from "@nestjs/common";
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
  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
  ) {}

  /**
   * Finds all active server IDs.
   * @returns A promise that resolves to an array of server IDs.
   */
  async findActiveServerIds(): Promise<string[]> {
    const servers = await this.serverRepository.find({
      where: {
        status: EntityStatus.ACTIVE,
        deletedAt: IsNull(),
      },
      select: { id: true },
      order: { createdAt: "ASC" },
    });

    return servers.map((server) => server.id);
  }

  /**
   * Finds a server health snapshot by server ID.
   * @param serverId - The ID of the server to find.
   * @returns A promise that resolves to a server health snapshot or null if not found.
   */
  async findServerHealthSnapshot(
    serverId: string,
  ): Promise<ServerHealthSnapshot | null> {
    return this.serverRepository.findOne({
      where: {
        id: serverId,
        status: EntityStatus.ACTIVE,
        deletedAt: IsNull(),
      },
      select: { id: true, metadata: true, retryCount: true },
    });
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
    await this.serverRepository.update(
      { id: serverId },
      {
        isServerUp: false,
        agentError: { ...agentError },
      },
    );
  }

  /**
   * Increments the retry count for a server.
   * @param serverId - The ID of the server to increment the retry count for.
   * @returns A promise that resolves when the retry count is incremented.
   */
  async incrementRetryCount(serverId: string): Promise<void> {
    await this.serverRepository.increment({ id: serverId }, "retryCount", 1);
  }

  /**
   * Marks a server as agent connected.
   * @param serverId - The ID of the server to mark as connected.
   * @param checkedAt - The timestamp of the check.
   * @returns A promise that resolves when the server is marked as connected.
   */
  async markAgentConnected(serverId: string, checkedAt: number): Promise<void> {
    await this.serverRepository.update(
      { id: serverId },
      {
        isServerUp: true,
        lastAgentCheckedAt: checkedAt,
        retryCount: 0,
        agentError: null,
      },
    );
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
    await this.incrementRetryCount(serverId);
    await this.recordAgentUnreachable(serverId, agentError);
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
    await this.serverRepository.update(
      { id: serverId },
      { agentError: { ...agentError } },
    );
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
    await this.serverRepository.update(
      { id: serverId },
      { serverError: { ...serverError } },
    );
  }
}
