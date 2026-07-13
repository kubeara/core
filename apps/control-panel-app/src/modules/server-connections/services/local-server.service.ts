import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { ActivityService } from "@control-panel/modules/activity/services/activity.service";
import { ActivityType } from "@control-panel/modules/activity/enums/activity-type.enum";
import { DeploymentStatus } from "@shared/socket-events";

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
    private readonly activityService: ActivityService,
  ) {}

  /**
   * Returns the active local server for a user, if one exists.
   *
   * @param userId - Owning user id.
   * @returns The local server entity, or null when none exists.
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
   *
   * When a new local server is created, a {@link ActivityType.SERVER_ADDED}
   * activity is recorded (best-effort; never blocks creation).
   *
   * @param userId - Owning user id.
   * @returns Existing or newly created local server entity.
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

      await this.activityService.recordActivity({
        userId,
        serverId: saved.id,
        type: ActivityType.SERVER_ADDED,
        title: `Server added · ${saved.name}`,
        message: `Local server created (${saved.host})`,
        operationStatus: DeploymentStatus.SUCCESS,
      });

      return saved;
    } catch (error) {
      throw new Error(
        `Failed to ensure local server: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
