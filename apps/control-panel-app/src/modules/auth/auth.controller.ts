import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
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
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  /**
   * Sign up a new user
   */
  @Post("signup")
  async signup(@Body() signupDto: SignupDto) {
    return await this.authService.signup(signupDto);
  }

  /**
   * Login a user
   */
  @Post("login")
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    this.authCookieService.setAuthCookies(res, result.data.tokens);

    return {
      message: result.message,
      data: {
        user: result.data.user,
      },
    };
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
    const result = await this.authService.refreshToken(req.user);
    this.authCookieService.setAuthCookies(res, result.data.tokens);

    return {
      message: result.message,
      data: null,
    };
  }

  /**
   * Get the profile of the authenticated user
   */
  @UseGuards(AccessTokenGuard)
  @Get("me")
  me(@Req() req: { user: AuthenticatedUser }) {
    return this.authService.getProfile(req.user.id);
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
    const result = await this.authService.logout(
      req.user.id,
      req.user.accessToken,
    );
    this.authCookieService.clearAuthCookies(res);

    return result;
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
    const result = await this.authService.logoutAllDevices(req.user.id);
    this.authCookieService.clearAuthCookies(res);

    return result;
  }

  /**
   * Forgot password
   */
  @Post("forgot-password")
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  /**
   * Verify OTP
   */
  @Post("verify-otp")
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  /**
   * Reset password
   */
  @Post("reset-password")
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
