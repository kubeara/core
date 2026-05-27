import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { EntityStatus } from "@control-panel/common/entity/base.entity";

import { LOCAL_SERVER } from "../constants/local-server.constants";
import { ServerEntity } from "../entities/server.entity";
import { ServerProvider } from "../enums/server-provider.enum";
import { ServerType } from "../enums/server-type.enum";

/**
 * Per-user {@link ServerType.LOCAL} row for deployments on the current machine
 * (no remote SSH / onboard required).
 */
@Injectable()
export class LocalServerService {
  private readonly logger = new Logger(LocalServerService.name);

  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
  ) {}

  /**
   * Returns the active local server for a user, if one exists.
   */
  async findLocalServer(userId: string): Promise<ServerEntity | null> {
    try {
      return await this.serverRepository.findOne({
        where: {
          userId,
          serverType: ServerType.LOCAL,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });
    } catch (error) {
      throw new Error(
        `Failed to find local server: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns the user's local server row, creating it when missing.
   */
  async ensureLocalServer(userId: string): Promise<ServerEntity> {
    try {
      const existing = await this.findLocalServer(userId);

      if (existing) {
        return existing;
      }

      const server = this.serverRepository.create({
        userId,
        name: LOCAL_SERVER.NAME,
        host: LOCAL_SERVER.HOST,
        port: 22,
        username: LOCAL_SERVER.USERNAME,
        provider: ServerProvider.ON_PREMISE,
        region: null,
        operatingSystem: null,
        serverType: ServerType.LOCAL,
        status: EntityStatus.ACTIVE,
        lastConnectedAt: null,
        metadata: { [LOCAL_SERVER.METADATA_KEY]: true },
      });

      const saved = await this.serverRepository.save(server);
      this.logger.log(
        `Created local server record id=${saved.id} for userId=${userId}`,
      );

      return saved;
    } catch (error) {
      throw new Error(
        `Failed to ensure local server: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
