import {
  Body,
  Controller,
  Logger,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { ProfileService } from "./profile.service";
import { AccessTokenGuard } from "@control-panel/modules/auth/guards/auth.guards";
import { AuthenticatedRequest } from "@control-panel/common/interfaces/authenticated-request.interface";
import { ChangePasswordDto, UpdateGeneralProfileDto } from "./dto";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { ProfileUser } from "./interfaces/profile-user.interface";

@UseGuards(AccessTokenGuard)
@Controller("profile")
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(private readonly profileService: ProfileService) {}

  /**
   * Update user's general profile information.
   */
  @Patch("general")
  async updateGeneralProfile(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateGeneralProfileDto,
  ): Promise<ServiceResponse<ProfileUser>> {
    try {
      return await this.profileService.updateGeneralProfile(req.user.id, body);
    } catch (error) {
      this.logger.error(
        `Update general profile failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Change user's password.
   */
  @Post("password")
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
  ): Promise<ServiceResponse<null>> {
    try {
      return await this.profileService.changePassword(req.user.id, body);
    } catch (error) {
      this.logger.error(`Change password failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
