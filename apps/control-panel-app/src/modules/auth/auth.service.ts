import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import dayjs from "dayjs";
import * as bcrypt from "bcrypt";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { OrganizationEntity } from "@control-panel/modules/organizations/entities/organization.entity";
import { AuthSessionsEntity } from "./entities/auth-sessions.entity";
import { SignupDto } from "./dto/signup.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { tokenType } from "./enum/tokenType.enum";
import {
  VerificationOtpEntity,
  VerificationType,
} from "./entities/verification-otp.entity";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { GenerateOTP } from "@control-panel/common/utils/generate-otp";

interface RefreshTokenPayload {
  sub: string;
  email: string;
  sessionId: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    @InjectRepository(AuthSessionsEntity)
    private readonly authSessionRepository: Repository<AuthSessionsEntity>,

    @InjectRepository(VerificationOtpEntity)
    private readonly verificationOtpRepository: Repository<VerificationOtpEntity>,

    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  private async generateTokens(
    user: UserEntity,
    sessionId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPayload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      tokenType: tokenType.ACCESS,
    };

    const refreshPayload = {
      sub: user.id,
      sessionId,
      tokenType: tokenType.REFRESH,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, { expiresIn: "15m" }),
      this.jwtService.signAsync(refreshPayload, { expiresIn: "7d" }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Sign up user
   * @param signupDto
   * @returns
   */
  async signup(signupDto: SignupDto) {
    const emailNormalized = signupDto.email.toLowerCase().trim();

    const existingUser = await this.userRepository.findOne({
      where: { email: emailNormalized },
    });

    if (existingUser) {
      throw new ConflictException(ERROR_MESSAGES.AUTH.EMAIL_ALREADY_EXISTS);
    }

    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const organizationName = signupDto.name?.trim()
        ? `${signupDto.name}'s Organization`
        : `${emailNormalized.split("@")[0]}'s Organization`;

      const organizationRepository =
        queryRunner.manager.getRepository(OrganizationEntity);

      const organization = organizationRepository.create({
        name: organizationName,
      });

      const savedOrganization = await organizationRepository.save(organization);

      const passwordHash = await bcrypt.hash(signupDto.password, 10);

      const userRepository = queryRunner.manager.getRepository(UserEntity);

      const user = userRepository.create({
        name: signupDto.name,
        email: emailNormalized,
        passwordHash,
        organizationId: savedOrganization.id,
        signUpAt: dayjs().unix(),
        isEmailVerified: true,
        emailVerifiedAt: dayjs().unix(),
      });

      const savedUser = await userRepository.save(user);

      await queryRunner.commitTransaction();

      return {
        message: SUCCESS_MESSAGES.AUTH.SIGNUP,
        data: {
          id: savedUser.id,
          name: savedUser.name,
          email: savedUser.email,
          organizationId: savedUser.organizationId,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Login user
   * @param loginDto
   * @returns
   */
  async login(loginDto: LoginDto) {
    const emailNormalized = loginDto.email.toLowerCase().trim();

    const user = await this.userRepository.findOne({
      where: { email: emailNormalized },
      relations: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    user.lastLoginAt = dayjs().valueOf();
    await this.userRepository.save(user);

    const authSession = await this.authSessionRepository.save(
      this.authSessionRepository.create({
        userId: user.id,
        tokenType: "jwt",
        accessToken: "",
        refreshToken: "",
        expiresAt: dayjs().add(7, "day").valueOf(),
        status: EntityStatus.ACTIVE,
      }),
    );

    const tokens = await this.generateTokens(user, authSession.id);

    authSession.accessToken = tokens.accessToken;
    authSession.refreshToken = tokens.refreshToken;
    await this.authSessionRepository.save(authSession);

    return {
      message: SUCCESS_MESSAGES.AUTH.LOGIN,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          organizationId: user.organizationId,
        },
      },
    };
  }

  /**
   * Refresh tokens using refresh token
   * @param refreshTokenDto
   * @returns
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const { refreshToken } = refreshTokenDto;

    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException(
        ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN,
      );
    }

    const authSession = await this.authSessionRepository.findOne({
      where: { id: payload.sessionId },
    });

    if (!authSession || authSession.status !== EntityStatus.ACTIVE) {
      throw new UnauthorizedException(
        ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN,
      );
    }

    if (authSession.refreshToken !== refreshToken) {
      throw new UnauthorizedException(
        ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN,
      );
    }

    if (Number(authSession.expiresAt) <= dayjs().valueOf()) {
      authSession.status = EntityStatus.INACTIVE;
      await this.authSessionRepository.save(authSession);
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.SESSION_EXPIRED);
    }

    const user = await this.userRepository.findOne({
      where: { id: authSession.userId },
    });

    if (!user || user.status !== EntityStatus.ACTIVE) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const tokens = await this.generateTokens(user, authSession.id);

    authSession.accessToken = tokens.accessToken;
    authSession.refreshToken = tokens.refreshToken;
    authSession.expiresAt = dayjs().add(7, "day").unix();
    authSession.metadata = {
      ...(authSession.metadata || {}),
      refreshedAt: dayjs().unix(),
    };
    await this.authSessionRepository.save(authSession);

    return {
      message: SUCCESS_MESSAGES.AUTH.REFRESH,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  /**
   * Revoke logged out user session
   * @param user
   * @param token
   * @returns
   */
  async logout(user: UserEntity, token?: string) {
    if (!token) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const authSession = await this.authSessionRepository.findOne({
      where: {
        accessToken: token,
        userId: user.id,
        status: EntityStatus.ACTIVE,
      },
    });

    if (!authSession) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    authSession.status = EntityStatus.INACTIVE;
    await this.authSessionRepository.save(authSession);

    return {
      message: SUCCESS_MESSAGES.AUTH.LOGOUT,
      data: null,
    };
  }

  /**
   * Get user profile
   * @param userId
   * @returns
   */
  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { organization: true },
    });

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
    }

    return {
      message: SUCCESS_MESSAGES.AUTH.PROFILE,
      data: user,
    };
  }

  /**
   * Forgot password - get otp
   * @param forgotPasswordDto
   * @returns
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const email = forgotPasswordDto.email.toLowerCase().trim();

    const user = await this.userRepository.findOne({
      where: { email },
    });

    /**
     * Never reveal whether email exists.
     */
    if (!user) {
      return {
        message: SUCCESS_MESSAGES.AUTH.OTP_SENT,
      };
    }

    await this.verificationOtpRepository.update(
      {
        userId: user.id,
        type: VerificationType.FORGOT_PASSWORD,
        verifiedAt: IsNull(),
      },
      {
        status: EntityStatus.INACTIVE,
      },
    );

    const otp = GenerateOTP();

    const otpHash = await bcrypt.hash(otp, 10);

    await this.verificationOtpRepository.save(
      this.verificationOtpRepository.create({
        userId: user.id,
        type: VerificationType.FORGOT_PASSWORD,
        otpHash,
        expiresAt: dayjs().add(10, "minute").unix(),
        attempts: 0,
      }),
    );

    /**
     * TODO
     * Send email here.
     */
    console.log(`OTP: ${otp}`);

    return {
      message: SUCCESS_MESSAGES.AUTH.OTP_SENT,
      data: {
        otp,
      },
    };
  }

  /**
   * Verify otp
   * @param verifyOtpDto
   * @returns
   */
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const email = verifyOtpDto.email.toLowerCase().trim();

    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_OTP);
    }

    const otpRecord = await this.verificationOtpRepository.findOne({
      where: {
        userId: user.id,
        type: VerificationType.FORGOT_PASSWORD,
        status: EntityStatus.ACTIVE,
      },
      order: {
        createdAt: "DESC",
      },
    });

    if (!otpRecord) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_OTP);
    }

    if (Number(otpRecord.expiresAt) < dayjs().unix()) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.OTP_EXPIRED);
    }

    if (otpRecord.attempts >= 5) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.MAX_OTP_ATTEMPTS);
    }

    const isValid = await bcrypt.compare(verifyOtpDto.otp, otpRecord.otpHash);

    if (!isValid) {
      otpRecord.attempts += 1;

      await this.verificationOtpRepository.save(otpRecord);

      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_OTP);
    }

    otpRecord.verifiedAt = dayjs().unix();

    await this.verificationOtpRepository.save(otpRecord);

    return {
      message: SUCCESS_MESSAGES.AUTH.OTP_VERIFIED,
    };
  }

  /**
   * Reset password
   * @param resetPasswordDto
   * @returns
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const email = resetPasswordDto.email.toLowerCase().trim();

    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
    }

    const otpRecord = await this.verificationOtpRepository.findOne({
      where: {
        userId: user.id,
        type: VerificationType.FORGOT_PASSWORD,
        status: EntityStatus.ACTIVE,
      },
      order: {
        createdAt: "DESC",
      },
    });

    if (!otpRecord?.verifiedAt) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.OTP_NOT_VERIFIED);
    }

    user.passwordHash = await bcrypt.hash(resetPasswordDto.newPassword, 10);

    user.lastPasswordResetAt = dayjs().unix();

    await this.userRepository.save(user);

    otpRecord.status = EntityStatus.INACTIVE;

    await this.verificationOtpRepository.save(otpRecord);

    await this.authSessionRepository.update(
      {
        userId: user.id,
        status: EntityStatus.ACTIVE,
      },
      {
        status: EntityStatus.INACTIVE,
      },
    );

    return {
      message: SUCCESS_MESSAGES.AUTH.PASSWORD_RESET,
    };
  }
}
