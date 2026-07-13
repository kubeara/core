import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { AuthenticatedRequest } from "@control-panel/common/interfaces/authenticated-request.interface";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { AccessTokenGuard } from "@control-panel/modules/auth/guards/auth.guards";

import type {
  ActivityDetail,
  ActivityListItem,
} from "../interfaces/activity.interfaces";
import { ActivityService } from "../services/activity.service";

@UseGuards(AccessTokenGuard)
@Controller("activity")
export class ActivityController {
  private readonly logger = new Logger(ActivityController.name);

  constructor(private readonly activityService: ActivityService) {}

  /**
   * Lists recent activities for a server owned by the authenticated user.
   *
   * @param req - Authenticated request (user id from access token).
   * @param serverId - Target server id (required query param).
   * @returns Service response with activity list items.
   */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query("serverId") serverId: string,
  ): Promise<ServiceResponse<ActivityListItem[]>> {
    try {
      const trimmedServerId = serverId?.trim();
      if (!trimmedServerId) {
        throw new BadRequestException("serverId query parameter is required");
      }

      return await this.activityService.listByServer(
        req.user.id,
        trimmedServerId,
      );
    } catch (error) {
      this.logger.error(`List activity failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Returns a single activity owned by the authenticated user.
   *
   * @param req - Authenticated request (user id from access token).
   * @param activityId - Activity primary key.
   * @returns Service response with the activity detail.
   */
  @Get(":activityId")
  async getDetail(
    @Req() req: AuthenticatedRequest,
    @Param("activityId") activityId: string,
  ): Promise<ServiceResponse<ActivityDetail>> {
    try {
      return await this.activityService.getDetail(req.user.id, activityId);
    } catch (error) {
      this.logger.error(
        `Get activity '${activityId}' failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }
}
