import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import dayjs from "dayjs";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { SALT_ROUNDS } from "@control-panel/constants/env.constant";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { UpdateGeneralProfileDto } from "./dto/update-general-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ProfileUser } from "./interfaces/profile-user.interface";

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  private buildFullName(firstName: string, lastName: string): string {
    return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  }

  private async findProfileUser(userId: string): Promise<ProfileUser> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { organization: true },
      select: {
        id: true,
        name: true,
        email: true,
        organizationId: true,
        profilePictureUrl: true,
        dateOfBirth: true,
        organization: {
          id: true,
          name: true,
          logo: true,
        },
      },
    });

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
    }

    return user;
  }

  /**
   * Update user's general profile information.
   */
  async updateGeneralProfile(
    userId: string,
    dto: UpdateGeneralProfileDto,
  ): Promise<ServiceResponse<ProfileUser>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
    }

    user.name = this.buildFullName(dto.firstName, dto.lastName);

    if (dto.profilePicture !== undefined) {
      user.profilePictureUrl = dto.profilePicture ?? "";
    }

    await this.userRepository.save(user);

    const updatedUser = await this.findProfileUser(userId);

    return {
      message: SUCCESS_MESSAGES.PROFILE.UPDATED,
      data: updatedUser,
    };
  }

  /**
   * Change user's password.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<ServiceResponse<null>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException(
        ERROR_MESSAGES.PROFILE.INVALID_CURRENT_PASSWORD,
      );
    }

    const isSamePassword = await bcrypt.compare(
      dto.newPassword,
      user.passwordHash,
    );

    if (isSamePassword) {
      throw new BadRequestException(ERROR_MESSAGES.AUTH.OLD_SAME_PASSWORD);
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    user.lastPasswordResetAt = dayjs().unix();

    await this.userRepository.save(user);

    return {
      message: SUCCESS_MESSAGES.PROFILE.PASSWORD_CHANGED,
      data: null,
    };
  }
}
