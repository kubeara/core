import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import dayjs from "dayjs";
import { In, IsNull, Not, Repository } from "typeorm";

import { EntityStatus } from "@control-panel/common/entity/entity-status";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";
import {
  DeploymentStatus,
  isTerminalDeploymentStatus,
} from "@shared/socket-events";

import { ActivityEntity } from "../entities/activity.entity";
import { ActivityType } from "../enums/activity-type.enum";
import type {
  ActivityDetail,
  ActivityListItem,
  StartActivityInput,
  UpdateActivityStatusInput,
} from "../interfaces/activity.interfaces";

const TERMINAL_STATUSES: DeploymentStatus[] = [
  DeploymentStatus.SUCCESS,
  DeploymentStatus.FAILED,
  DeploymentStatus.CANCELLED,
  DeploymentStatus.REMOVED,
];

/**
 * Persists and queries the per-server Activity timeline.
 *
 * Activity writes are designed to be non-fatal for callers: use {@link recordActivity}
 * or {@link tryStartActivity} from deploy/container/terminal paths so a DB issue
 * never blocks the underlying operation.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  /** In-memory map of open deploymentId → activityId for fast status sync. */
  private readonly openByDeploymentId = new Map<string, string>();

  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
  ) {}

  /**
   * Creates a new activity row.
   *
   * @param input - Fields for the new activity row.
   * @returns The persisted activity entity.
   * @throws When the insert fails (e.g. missing table, constraint error).
   */
  async startActivity(input: StartActivityInput): Promise<ActivityEntity> {
    try {
      const activity = this.activityRepository.create({
        userId: input.userId,
        serverId: input.serverId,
        type: input.type,
        title: input.title,
        message: input.message ?? null,
        deploymentId: input.deploymentId ?? null,
        templateSlug: input.templateSlug ?? null,
        operationStatus: input.operationStatus ?? DeploymentStatus.PENDING,
        status: EntityStatus.ACTIVE,
      });

      const saved = await this.activityRepository.save(activity);

      if (
        saved.deploymentId &&
        !isTerminalDeploymentStatus(saved.operationStatus)
      ) {
        this.openByDeploymentId.set(saved.deploymentId, saved.id);
      }

      return saved;
    } catch (error) {
      this.logger.error(`Start activity failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Fire-and-forget activity create that never throws to callers.
   *
   * @param input - Fields for the new activity row.
   * @returns Resolves after insert attempt (success or logged failure).
   */
  async recordActivity(input: StartActivityInput): Promise<void> {
    try {
      await this.startActivity(input);
    } catch (error) {
      this.logger.warn(
        `Could not record activity '${input.type}': ${toErrorMessage(error)}`,
      );
    }
  }

  /**
   * Starts an activity and returns its id, or null when persistence fails.
   *
   * Use from flows that need an activityId for later status updates but must
   * continue even if activity tracking is unavailable.
   *
   * @param input - Fields for the new activity row.
   * @returns The new activity id, or null if create failed.
   */
  async tryStartActivity(input: StartActivityInput): Promise<string | null> {
    try {
      const saved = await this.startActivity(input);
      return saved.id;
    } catch (error) {
      this.logger.warn(
        `Could not start activity '${input.type}': ${toErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Updates the open (non-terminal) activity linked to a deployment.
   *
   * @param deploymentId - Service deployment id to match.
   * @param input - Status / message / optional type or title overrides.
   * @returns True when an open activity was found and updated; otherwise false.
   */
  async syncDeploymentActivityStatus(
    deploymentId: string,
    input: UpdateActivityStatusInput,
  ): Promise<boolean> {
    try {
      const activity = await this.findOpenActivityForDeployment(deploymentId);
      if (!activity) {
        return false;
      }

      const update: UpdateActivityStatusInput = { ...input };
      if (
        input.type === ActivityType.DEPLOYMENT_VALIDATION_STOPPED &&
        activity.templateSlug
      ) {
        update.title = `Deploy blocked · ${activity.templateSlug}`;
      }

      await this.applyStatusUpdate(activity, update);
      return true;
    } catch (error) {
      this.logger.error(
        `Sync deployment activity status failed for '${deploymentId}': ${toErrorMessage(error)}`,
      );
      return false;
    }
  }

  /**
   * Syncs an open deployment activity, or records a new terminal row when none is open.
   *
   * Used when agent status arrives after CP restart or when startActivity was skipped.
   * Does not create a duplicate when the latest activity for this deployment already
   * has the same terminal operationStatus.
   *
   * @param deploymentId - Service deployment id.
   * @param input - Status update applied to an open activity when present.
   * @param fallback - Create payload used only when no open activity exists.
   * @returns Resolves after sync or create attempt.
   */
  async syncOrRecordDeploymentActivity(
    deploymentId: string,
    input: UpdateActivityStatusInput,
    fallback: StartActivityInput,
  ): Promise<void> {
    const synced = await this.syncDeploymentActivityStatus(deploymentId, input);
    if (synced) {
      return;
    }

    if (!isTerminalDeploymentStatus(input.operationStatus)) {
      return;
    }

    try {
      const latest = await this.findLatestByDeploymentId(deploymentId);
      if (
        latest &&
        latest.operationStatus === input.operationStatus &&
        (input.type == null || latest.type === input.type)
      ) {
        return;
      }

      await this.recordActivity({
        ...fallback,
        operationStatus: input.operationStatus,
        message: input.message ?? fallback.message,
        type: input.type ?? fallback.type,
        title: input.title ?? fallback.title,
        deploymentId,
      });
    } catch (error) {
      this.logger.warn(
        `Could not record fallback deployment activity for '${deploymentId}': ${toErrorMessage(error)}`,
      );
    }
  }

  /**
   * Updates a specific activity by id (container actions, log sessions).
   *
   * @param activityId - Activity primary key.
   * @param input - Status / message updates to apply.
   * @returns Resolves after update attempt (no-op when row is missing).
   */
  async updateActivityStatus(
    activityId: string,
    input: UpdateActivityStatusInput,
  ): Promise<void> {
    try {
      const activity = await this.activityRepository.findOne({
        where: { id: activityId, deletedAt: IsNull() },
      });
      if (!activity) {
        return;
      }

      await this.applyStatusUpdate(activity, input);
    } catch (error) {
      this.logger.error(
        `Update activity '${activityId}' failed: ${toErrorMessage(error)}`,
      );
    }
  }

  /**
   * Lists recent activities for a server owned by the authenticated user.
   *
   * @param userId - Authenticated user id (ownership filter).
   * @param serverId - Server whose Activity tab is being loaded.
   * @returns Service response with up to 100 newest activities.
   */
  async listByServer(
    userId: string,
    serverId: string,
  ): Promise<ServiceResponse<ActivityListItem[]>> {
    try {
      const activities = await this.activityRepository.find({
        where: {
          userId,
          serverId,
          deletedAt: IsNull(),
          status: EntityStatus.ACTIVE,
        },
        order: { createdAt: "DESC" },
        take: 100,
      });

      return {
        message: SUCCESS_MESSAGES.ACTIVITY.LIST,
        data: activities.map((activity) => this.toListItem(activity)),
      };
    } catch (error) {
      this.logger.error(
        `List activities failed for server '${serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Returns one activity row for the owning user.
   *
   * @param userId - Authenticated user id (ownership filter).
   * @param activityId - Activity primary key.
   * @returns Service response with the activity detail payload.
   * @throws NotFoundException when the activity is missing or not owned by the user.
   */
  async getDetail(
    userId: string,
    activityId: string,
  ): Promise<ServiceResponse<ActivityDetail>> {
    try {
      const activity = await this.activityRepository.findOne({
        where: {
          id: activityId,
          userId,
          deletedAt: IsNull(),
          status: EntityStatus.ACTIVE,
        },
      });

      if (!activity) {
        throw new NotFoundException(ERROR_MESSAGES.ACTIVITY.NOT_FOUND);
      }

      return {
        message: SUCCESS_MESSAGES.ACTIVITY.DETAIL,
        data: this.toListItem(activity),
      };
    } catch (error) {
      this.logger.error(
        `Get activity '${activityId}' failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Maps a container lifecycle action name to an {@link ActivityType}.
   *
   * @param action - Container action from the deployments API.
   * @returns Matching activity type enum value.
   */
  containerActionType(
    action: "start" | "stop" | "restart" | "delete",
  ): ActivityType {
    switch (action) {
      case "start":
        return ActivityType.CONTAINER_START;
      case "stop":
        return ActivityType.CONTAINER_STOP;
      case "restart":
        return ActivityType.CONTAINER_RESTART;
      case "delete":
        return ActivityType.CONTAINER_DELETE;
    }
  }

  /**
   * Applies a status update to an activity entity and clears the open-deployment cache
   * when the status becomes terminal.
   *
   * @param activity - Existing activity row to update.
   * @param input - Fields to patch (status required; message/title/type optional).
   */
  private async applyStatusUpdate(
    activity: ActivityEntity,
    input: UpdateActivityStatusInput,
  ): Promise<void> {
    const now = dayjs().unix();
    const isTerminal = isTerminalDeploymentStatus(input.operationStatus);

    await this.activityRepository.update(
      { id: activity.id },
      {
        operationStatus: input.operationStatus,
        updatedAt: now,
        ...(input.message !== undefined ? { message: input.message } : {}),
        ...(input.title !== undefined && input.title != null
          ? { title: input.title }
          : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
      },
    );

    if (isTerminal && activity.deploymentId) {
      const mapped = this.openByDeploymentId.get(activity.deploymentId);
      if (mapped === activity.id) {
        this.openByDeploymentId.delete(activity.deploymentId);
      }
    }
  }

  /**
   * Finds the latest incomplete activity linked to a deployment.
   *
   * @param deploymentId - Service deployment id.
   * @returns Open activity entity, or null when none is in progress.
   */
  private async findOpenActivityForDeployment(
    deploymentId: string,
  ): Promise<ActivityEntity | null> {
    const cached = this.openByDeploymentId.get(deploymentId);
    if (cached) {
      const fromCache = await this.activityRepository.findOne({
        where: { id: cached, deletedAt: IsNull() },
      });
      if (fromCache && !isTerminalDeploymentStatus(fromCache.operationStatus)) {
        return fromCache;
      }
    }

    return this.activityRepository.findOne({
      where: {
        deploymentId,
        deletedAt: IsNull(),
        status: EntityStatus.ACTIVE,
        operationStatus: Not(In(TERMINAL_STATUSES)),
      },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Finds the newest activity row for a deployment (any status).
   *
   * @param deploymentId - Service deployment id.
   * @returns Latest activity for the deployment, or null.
   */
  private async findLatestByDeploymentId(
    deploymentId: string,
  ): Promise<ActivityEntity | null> {
    return this.activityRepository.findOne({
      where: {
        deploymentId,
        deletedAt: IsNull(),
        status: EntityStatus.ACTIVE,
      },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Maps an activity entity to the list/detail API shape.
   *
   * @param activity - Persisted activity entity.
   * @returns API list item DTO aligned with {@link ActivityListItem}.
   */
  private toListItem(activity: ActivityEntity): ActivityListItem {
    return {
      id: activity.id,
      serverId: activity.serverId,
      type: activity.type,
      title: activity.title,
      message: activity.message,
      operationStatus: activity.operationStatus,
      deploymentId: activity.deploymentId,
      templateSlug: activity.templateSlug,
      createdAt: Number(activity.createdAt),
      updatedAt: Number(activity.updatedAt),
    };
  }
}
