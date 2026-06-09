import { Body, Controller, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ProfileService } from "./profile.service";
import { AccessTokenGuard } from "@control-panel/modules/auth/guards/auth.guards";
import { AuthenticatedRequest } from "@control-panel/common/interfaces/authenticated-request.interface";
import { ChangePasswordDto, UpdateGeneralProfileDto } from "./dto";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { ProfileUser } from "./interfaces/profile-user.interface";

@UseGuards(AccessTokenGuard)
@Controller("profile")
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * Update user's general profile information.
   */
  @Patch("general")
  updateGeneralProfile(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateGeneralProfileDto,
  ): Promise<ServiceResponse<ProfileUser>> {
    return this.profileService.updateGeneralProfile(req.user.id, body);
  }

  /**
   * Change user's password.
   */
  @Post("password")
  changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
  ): Promise<ServiceResponse<null>> {
    return this.profileService.changePassword(req.user.id, body);
  }
}
