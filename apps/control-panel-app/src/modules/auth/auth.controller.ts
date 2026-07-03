import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { AuthService } from "./auth.service";
import { SignupDto } from "./dto/signup.dto";
import { LoginDto } from "./dto/login.dto";
import { AccessTokenGuard, RefreshTokenGuard } from "./guards/auth.guards";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { AuthCookieService } from "./services/auth-cookie.service";
import { AuthenticatedUser } from "./interfaces/authenticated-user.interface";
import { RefreshTokenPayload } from "./strategies/refresh-jwt.strategy";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  /**
   * Sign up a new user
   */
  @Post("signup")
  async signup(@Body() signupDto: SignupDto) {
    try {
      return await this.authService.signup(signupDto);
    } catch (error) {
      this.logger.error(`Signup failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Login a user
   */
  @Post("login")
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.login(loginDto);
      this.authCookieService.setAuthCookies(res, result.data.tokens);

      return {
        message: result.message,
        data: {
          user: result.data.user,
        },
      };
    } catch (error) {
      this.logger.error(`Login failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Refresh a user's tokens
   */
  @UseGuards(RefreshTokenGuard)
  @Post("refresh-token")
  async refreshToken(
    @Req() req: { user: RefreshTokenPayload },
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.refreshToken(req.user);
      this.authCookieService.setAuthCookies(res, result.data.tokens);

      return {
        message: result.message,
        data: null,
      };
    } catch (error) {
      this.logger.error(`Refresh token failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Get the profile of the authenticated user
   */
  @UseGuards(AccessTokenGuard)
  @Get("me")
  async me(@Req() req: { user: AuthenticatedUser }) {
    try {
      return await this.authService.getProfile(req.user.id);
    } catch (error) {
      this.logger.error(`Get profile failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Logout a user
   */
  @UseGuards(AccessTokenGuard)
  @Post("logout")
  async logout(
    @Req() req: { user: AuthenticatedUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.logout(
        req.user.id,
        req.user.accessToken,
      );
      this.authCookieService.clearAuthCookies(res);

      return result;
    } catch (error) {
      this.logger.error(`Logout failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Logout all devices of the authenticated user
   */
  @UseGuards(AccessTokenGuard)
  @Post("logout-all")
  async logoutAll(
    @Req() req: { user: AuthenticatedUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.logoutAllDevices(req.user.id);
      this.authCookieService.clearAuthCookies(res);

      return result;
    } catch (error) {
      this.logger.error(`Logout all failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Forgot password
   */
  @Post("forgot-password")
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    try {
      return await this.authService.forgotPassword(forgotPasswordDto);
    } catch (error) {
      this.logger.error(`Forgot password failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Verify OTP
   */
  @Post("verify-otp")
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    try {
      return await this.authService.verifyOtp(verifyOtpDto);
    } catch (error) {
      this.logger.error(`Verify OTP failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Reset password
   */
  @Post("reset-password")
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    try {
      return await this.authService.resetPassword(resetPasswordDto);
    } catch (error) {
      this.logger.error(`Reset password failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
