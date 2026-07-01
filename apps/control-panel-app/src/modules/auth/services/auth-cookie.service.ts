import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CookieOptions, Response } from "express";
import ms, { StringValue } from "ms";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { isJwtToken } from "../utils/cookie-extractor.util";

/** Canonical path for all auth cookies — must match on set and clear. */
const AUTH_COOKIE_PATH = "/";

export interface AuthCookieTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthCookieService {
  private readonly logger = new Logger(AuthCookieService.name);

  constructor(private readonly configService: ConfigService) {}

  getAccessTokenCookieName(): string {
    return this.configService.getOrThrow<string>("ACCESS_TOKEN_COOKIE_NAME");
  }

  getRefreshTokenCookieName(): string {
    return this.configService.getOrThrow<string>("REFRESH_TOKEN_COOKIE_NAME");
  }

  /**
   * Set the authentication cookies
   */
  setAuthCookies(res: Response, tokens: AuthCookieTokens): void {
    try {
      this.assertJwtTokens(tokens);

      res.cookie(
        this.getAccessTokenCookieName(),
        tokens.accessToken,
        this.buildOptions(this.getAccessTokenMaxAgeMs()),
      );

      res.cookie(
        this.getRefreshTokenCookieName(),
        tokens.refreshToken,
        this.buildOptions(this.getRefreshTokenMaxAgeMs()),
      );
    } catch (error) {
      this.logger.error(`Set auth cookies failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Clear the authentication cookies
   */
  clearAuthCookies(res: Response): void {
    try {
      const clearOptions = this.buildOptions(0);

      res.clearCookie(this.getAccessTokenCookieName(), clearOptions);
      res.clearCookie(this.getRefreshTokenCookieName(), clearOptions);
    } catch (error) {
      this.logger.error(`Clear auth cookies failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  private assertJwtTokens(tokens: AuthCookieTokens): void {
    if (!isJwtToken(tokens.accessToken)) {
      throw new InternalServerErrorException("Invalid access token format");
    }

    if (!isJwtToken(tokens.refreshToken)) {
      throw new InternalServerErrorException("Invalid refresh token format");
    }
  }

  /**
   * Build the cookie options
   */
  private buildOptions(maxAgeMs: number): CookieOptions {
    const domain = this.configService.get<string>("COOKIE_DOMAIN")?.trim();
    const secure = this.configService.get<string>("COOKIE_SECURE") === "true";
    const sameSite = this.configService.get<
      "strict" | "lax" | "none" | "Strict" | "Lax" | "None"
    >("COOKIE_SAME_SITE");

    const normalizedSameSite = (sameSite?.toLowerCase() ?? "lax") as
      "strict" | "lax" | "none";

    return {
      httpOnly: true,
      secure,
      sameSite: normalizedSameSite,
      path: AUTH_COOKIE_PATH,
      maxAge: maxAgeMs,
      ...(domain ? { domain } : {}),
    };
  }

  /**
   * Get the maximum age of the access token in milliseconds
   */
  private getAccessTokenMaxAgeMs(): number {
    return this.expiresInToMs(
      this.configService.getOrThrow<StringValue>("ACCESS_TOKEN_EXPIRES_IN"),
    );
  }

  /**
   * Get the maximum age of the refresh token in milliseconds
   */
  private getRefreshTokenMaxAgeMs(): number {
    return this.expiresInToMs(
      this.configService.getOrThrow<StringValue>("REFRESH_TOKEN_EXPIRES_IN"),
    );
  }

  private expiresInToMs(expiresIn: StringValue): number {
    const duration = ms(expiresIn);
    if (typeof duration !== "number") {
      throw new Error(`Invalid token expiry duration: ${expiresIn}`);
    }
    return duration;
  }
}
