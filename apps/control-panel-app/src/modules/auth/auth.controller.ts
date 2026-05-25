import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SignupDto } from "./dto/signup.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /*
   * Handle user registration.
   */
  @Post("signup")
  async signup(@Body() signupDto: SignupDto) {
    return await this.authService.signup(signupDto);
  }

  /*
   * Handle user authentication.
   */
  @Post("login")
  async login(@Body() loginDto: LoginDto) {
    return await this.authService.login(loginDto);
  }

  /*
   * Handle requests for rotating refresh/access tokens.
   */
  @Post("refresh-token")
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return await this.authService.refreshToken(refreshTokenDto);
  }

  /*
   * Return details of the currently authenticated user session.
   */
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: { user: UserEntity }) {
    const user = { ...req.user };
    return this.authService.getProfile(user.id);
  }

  /*
   * Handle user logout and session revocation.
   */
  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(
    @Req() req: { user: UserEntity; headers: Record<string, unknown> },
  ) {
    const authHeader = req.headers.authorization;
    const token =
      typeof authHeader === "string" ? authHeader.split(" ")[1] : undefined;
    return await this.authService.logout(req.user, token);
  }

  /**
   * Send OTP for password reset.
   */
  @Post("forgot-password")
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  /**
   * Verify OTP and return reset token.
   */
  @Post("verify-otp")
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  /**
   * Reset password.
   */
  @Post("reset-password")
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
