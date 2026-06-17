import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, MoreThan, Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import dayjs from "dayjs";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";
import ms, { StringValue } from "ms";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { OrganizationEntity } from "@control-panel/modules/organizations/entities/organization.entity";
import { AuthSessionsEntity } from "./entities/auth-sessions.entity";
import { SignupDto } from "./dto/signup.dto";
import { LoginDto } from "./dto/login.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { tokenType } from "./enum/tokenType.enum";
import { UserCodeEntity } from "./entities/user-codes.entity";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { GenerateOTP } from "@control-panel/common/utils/generate-otp";
import { CODE_TYPE } from "./enum/codeType.enum";
import { SALT_ROUNDS } from "@control-panel/constants/env.constant";
import { isJwtToken } from "./utils/cookie-extractor.util";
import { hashToken } from "./utils/token-hash.util";
import { AuthSessionLookupService } from "./services/auth-session-lookup.service";
import { EmailService } from "../email/email.service";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    @InjectRepository(AuthSessionsEntity)
    private readonly authSessionRepository: Repository<AuthSessionsEntity>,

    @InjectRepository(UserCodeEntity)
    private readonly userCodeRepository: Repository<UserCodeEntity>,

    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authSessionLookupService: AuthSessionLookupService,
    private readonly emailService: EmailService,
  ) {}

  private resolveRefreshExpiresIn(): StringValue {
    return this.configService.getOrThrow<StringValue>(
      "REFRESH_TOKEN_EXPIRES_IN",
    );
  }

  private getRefreshExpiresAt(): number {
    const expiresIn = this.resolveRefreshExpiresIn();
    const expiresInMs = ms(expiresIn);
    if (typeof expiresInMs !== "number") {
      throw new Error(`Invalid refresh token expiry: ${expiresIn}`);
    }
    return dayjs().add(expiresInMs, "millisecond").unix();
  }

  private getOtpExpiresAt(): number {
    const expiresIn =
      this.configService.getOrThrow<StringValue>("OTP_EXPIRES_IN");
    const expiresInMs = ms(expiresIn);
    if (typeof expiresInMs !== "number") {
      throw new Error(`Invalid OTP expiry: ${expiresIn}`);
    }
    return dayjs().add(expiresInMs, "millisecond").unix();
  }

  private getOtpResendMaxAttempts(): number {
    const parsed = Number(this.configService.get("OTP_RESEND_MAX_ATTEMPTS", 3));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }

  private getOtpResendWindowSeconds(): number {
    const parsed = Number(
      this.configService.get("OTP_RESEND_WINDOW_MINUTES", 15),
    );
    const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
    return minutes * 60;
  }

  private async countOtpSendsInWindow(
    userId: string,
    codeType: CODE_TYPE,
  ): Promise<number> {
    const windowStart = dayjs().unix() - this.getOtpResendWindowSeconds();

    return this.userCodeRepository.count({
      where: {
        userId,
        codeType,
        createdAt: MoreThan(windowStart),
      },
    });
  }

  private async getOtpResendRetryAfterSeconds(
    userId: string,
    codeType: CODE_TYPE,
  ): Promise<number> {
    const windowStart = dayjs().unix() - this.getOtpResendWindowSeconds();
    const oldest = await this.userCodeRepository.findOne({
      where: {
        userId,
        codeType,
        createdAt: MoreThan(windowStart),
      },
      order: {
        createdAt: "ASC",
      },
    });

    if (!oldest) {
      return this.getOtpResendWindowSeconds();
    }

    const windowEnd =
      Number(oldest.createdAt) + this.getOtpResendWindowSeconds();
    return Math.max(1, windowEnd - dayjs().unix());
  }

  private async assertOtpResendAllowed(
    userId: string,
    codeType: CODE_TYPE,
  ): Promise<void> {
    const sendCount = await this.countOtpSendsInWindow(userId, codeType);
    if (sendCount >= 1 + this.getOtpResendMaxAttempts()) {
      const retryAfterSeconds = await this.getOtpResendRetryAfterSeconds(
        userId,
        codeType,
      );
      const retryMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

      throw new HttpException(
        {
          message: ERROR_MESSAGES.AUTH.OTP_RESEND_LIMIT_REACHED.replace(
            "{minutes}",
            String(retryMinutes),
          ),
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async replaceOtp(userId: string, codeType: CODE_TYPE): Promise<void> {
    await this.userCodeRepository.update(
      {
        userId,
        codeType,
        status: EntityStatus.ACTIVE,
      },
      {
        status: EntityStatus.INACTIVE,
      },
    );
  }

  private async createOtpRecord(
    userId: string,
    codeType: CODE_TYPE,
  ): Promise<{ otp: string }> {
    await this.replaceOtp(userId, codeType);

    const otp = GenerateOTP();
    const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);

    await this.userCodeRepository.save(
      this.userCodeRepository.create({
        userId,
        codeType,
        otpHash,
        expiresAt: this.getOtpExpiresAt(),
        attempts: 0,
      }),
    );

    return { otp };
  }

  private async sendOtpEmail(
    user: UserEntity,
    codeType: CODE_TYPE,
    otp: string,
  ) {
    const purposeLabel =
      codeType === CODE_TYPE.EMAIL_VERIFICATION
        ? "Email verification"
        : "Password reset";

    await this.emailService.sendOtpEmail({
      toEmail: user.email,
      toName: user.name,
      otp,
      purposeLabel,
    });
  }

  private async getLatestActiveOtpRecord(
    userId: string,
    codeType: CODE_TYPE,
  ): Promise<UserCodeEntity | null> {
    return this.userCodeRepository.findOne({
      where: {
        userId,
        codeType,
        status: EntityStatus.ACTIVE,
      },
      order: {
        createdAt: "DESC",
      },
    });
  }

  /**
   * Generate access and refresh tokens for a user
   */
  private async generateTokens(user: UserEntity): Promise<AuthTokens> {
    const accessPayload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      tokenType: tokenType.ACCESS,
      jti: randomUUID(),
    };

    const refreshPayload = {
      sub: user.id,
      tokenType: tokenType.REFRESH,
      jti: randomUUID(),
    };

    const accessExpiresIn = this.configService.getOrThrow<StringValue>(
      "ACCESS_TOKEN_EXPIRES_IN",
    );

    const refreshExpiresIn = this.resolveRefreshExpiresIn();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: refreshExpiresIn,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Persist session tokens to the database
   */
  private async persistSessionTokens(
    session: AuthSessionsEntity,
    tokens: AuthTokens,
  ): Promise<void> {
    session.accessToken = hashToken(tokens.accessToken);
    session.refreshToken = hashToken(tokens.refreshToken);
    session.expiresAt = this.getRefreshExpiresAt();
    await this.authSessionRepository.save(session);
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    await this.authSessionRepository.update(
      {
        userId,
        status: EntityStatus.ACTIVE,
      },
      {
        status: EntityStatus.INACTIVE,
      },
    );
  }

  /**
   * Sign up a new user
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

      const passwordHash = await bcrypt.hash(signupDto.password, SALT_ROUNDS);

      const userRepository = queryRunner.manager.getRepository(UserEntity);

      const user = userRepository.create({
        name: signupDto.name,
        email: emailNormalized,
        passwordHash,
        organizationId: savedOrganization.id,
        signUpAt: dayjs().unix(),
        isEmailVerified: false,
        emailVerifiedAt: undefined,
        dateOfBirth: undefined,
      });

      const savedUser = await userRepository.save(user);

      await queryRunner.commitTransaction();

      const { otp } = await this.createOtpRecord(
        savedUser.id,
        CODE_TYPE.EMAIL_VERIFICATION,
      );
      await this.sendOtpEmail(savedUser, CODE_TYPE.EMAIL_VERIFICATION, otp);

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
   * Login a user
   */
  async login(loginDto: LoginDto): Promise<{
    message: string;
    data: {
      user: {
        id: string;
        name: string;
        email: string;
        organizationId: string;
      };
      tokens: AuthTokens;
    };
  }> {
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

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.EMAIL_NOT_VERIFIED);
    }

    user.lastLoginAt = dayjs().valueOf();
    await this.userRepository.save(user);

    const tokens = await this.generateTokens(user);
    const session = this.authSessionRepository.create({
      userId: user.id,
      tokenType: "jwt",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: this.getRefreshExpiresAt(),
      status: EntityStatus.ACTIVE,
    });

    await this.persistSessionTokens(session, tokens);

    return {
      message: SUCCESS_MESSAGES.AUTH.LOGIN,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          organizationId: user.organizationId,
        },
        tokens,
      },
    };
  }

  /**
   * Refresh a user's tokens
   */
  async refreshToken(input: {
    userId: string;
    refreshToken: string;
  }): Promise<{ message: string; data: { tokens: AuthTokens } }> {
    const { userId, refreshToken } = input;

    if (!isJwtToken(refreshToken)) {
      throw new UnauthorizedException(
        ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN,
      );
    }

    const authSession =
      await this.authSessionLookupService.findSessionByRefreshToken(
        userId,
        refreshToken,
      );

    if (!authSession) {
      await this.revokeAllUserSessions(userId);
      throw new UnauthorizedException(
        ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN,
      );
    }

    if (authSession.status !== EntityStatus.ACTIVE) {
      await this.revokeAllUserSessions(userId);
      throw new UnauthorizedException(
        ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN,
      );
    }

    if (Number(authSession.expiresAt) <= dayjs().unix()) {
      authSession.status = EntityStatus.INACTIVE;
      await this.authSessionRepository.save(authSession);

      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.SESSION_EXPIRED);
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user || user.status !== EntityStatus.ACTIVE) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const tokens = await this.generateTokens(user);

    authSession.metadata = {
      ...(authSession.metadata || {}),
      refreshedAt: dayjs().unix(),
    };

    await this.persistSessionTokens(authSession, tokens);

    return {
      message: SUCCESS_MESSAGES.AUTH.REFRESH,
      data: { tokens },
    };
  }

  /**
   * Logout a user
   */
  async logout(userId: string, accessToken?: string) {
    if (!accessToken) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const authSession =
      await this.authSessionLookupService.findActiveSessionByAccessToken(
        userId,
        accessToken,
      );

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

  async logoutAllDevices(userId: string) {
    await this.revokeAllUserSessions(userId);

    return {
      message: SUCCESS_MESSAGES.AUTH.LOGOUT_ALL,
      data: null,
    };
  }

  /**
   * Get the profile of the authenticated user
   */
  async getProfile(userId: string) {
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

    return {
      message: SUCCESS_MESSAGES.AUTH.PROFILE,
      data: user,
    };
  }

  /**
   * Forgot password
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const email = forgotPasswordDto.email.toLowerCase().trim();

    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
    }

    await this.assertOtpResendAllowed(user.id, CODE_TYPE.FORGOT_PASSWORD);

    const { otp } = await this.createOtpRecord(
      user.id,
      CODE_TYPE.FORGOT_PASSWORD,
    );
    await this.sendOtpEmail(user, CODE_TYPE.FORGOT_PASSWORD, otp);

    return {
      message: SUCCESS_MESSAGES.AUTH.OTP_SENT,
      data: null,
    };
  }

  async resendOtp(email: string) {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    await this.assertOtpResendAllowed(user.id, CODE_TYPE.EMAIL_VERIFICATION);

    const { otp } = await this.createOtpRecord(
      user.id,
      CODE_TYPE.EMAIL_VERIFICATION,
    );
    await this.sendOtpEmail(user, CODE_TYPE.EMAIL_VERIFICATION, otp);

    return {
      message: SUCCESS_MESSAGES.AUTH.OTP_RESENT,
      data: null,
    };
  }

  /**
   * Verify OTP
   */
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const email = verifyOtpDto.email.toLowerCase().trim();

    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_OTP);
    }

    const otpRecord = await this.getLatestActiveOtpRecord(
      user.id,
      verifyOtpDto.purpose,
    );

    if (!otpRecord) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_OTP);
    }

    if (Number(otpRecord.expiresAt) < dayjs().unix()) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.OTP_EXPIRED);
    }

    if (otpRecord.attempts >= 3) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.MAX_OTP_ATTEMPTS);
    }

    const isValid = await bcrypt.compare(verifyOtpDto.otp, otpRecord.otpHash);

    if (!isValid) {
      otpRecord.attempts += 1;

      await this.userCodeRepository.save(otpRecord);

      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_OTP);
    }

    otpRecord.verifiedAt = dayjs().unix();

    await this.userCodeRepository.save(otpRecord);

    if (verifyOtpDto.purpose === CODE_TYPE.EMAIL_VERIFICATION) {
      user.isEmailVerified = true;
      user.emailVerifiedAt = dayjs().unix();
      await this.userRepository.save(user);
    }

    const message =
      verifyOtpDto.purpose === CODE_TYPE.EMAIL_VERIFICATION
        ? SUCCESS_MESSAGES.AUTH.EMAIL_VERIFIED
        : SUCCESS_MESSAGES.AUTH.RESET_CODE_VERIFIED;

    return {
      message,
      data: null,
    };
  }

  /**
   * Reset password
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const email = resetPasswordDto.email.toLowerCase().trim();

    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
    }

    const otpRecord = await this.getLatestActiveOtpRecord(
      user.id,
      CODE_TYPE.FORGOT_PASSWORD,
    );

    if (!otpRecord?.verifiedAt) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.OTP_NOT_VERIFIED);
    }

    user.passwordHash = await bcrypt.hash(
      resetPasswordDto.newPassword,
      SALT_ROUNDS,
    );

    user.lastPasswordResetAt = dayjs().unix();

    await this.userRepository.save(user);

    otpRecord.status = EntityStatus.INACTIVE;

    await this.userCodeRepository.save(otpRecord);
    await this.userCodeRepository.update(
      {
        userId: user.id,
        codeType: CODE_TYPE.FORGOT_PASSWORD,
      },
      {
        status: EntityStatus.INACTIVE,
      },
    );

    await this.revokeAllUserSessions(user.id);

    return {
      message: SUCCESS_MESSAGES.AUTH.PASSWORD_RESET,
      data: null,
    };
  }
}
