import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { tokenType } from "../enum/tokenType.enum";
import { extractCookieToken } from "../utils/cookie-extractor.util";
import { AuthCookieService } from "../services/auth-cookie.service";

export interface RefreshTokenPayload {
  userId: string;
  refreshToken: string;
}

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(
  Strategy,
  "jwt-refresh",
) {
  private readonly refreshTokenCookieName: string;

  constructor(
    configService: ConfigService,
    authCookieService: AuthCookieService,
  ) {
    const refreshTokenCookieName =
      authCookieService.getRefreshTokenCookieName();

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) =>
          extractCookieToken(req, refreshTokenCookieName, { requireJwt: true }),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
      passReqToCallback: true,
    });

    this.refreshTokenCookieName = refreshTokenCookieName;
  }

  /**
   * Validate the refresh token
   */
  validate(
    req: Request,
    payload: { sub: string; tokenType?: string },
  ): RefreshTokenPayload {
    if (payload.tokenType !== tokenType.REFRESH) {
      throw new UnauthorizedException(
        ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN,
      );
    }

    const refreshToken = extractCookieToken(req, this.refreshTokenCookieName, {
      requireJwt: true,
    });

    if (!refreshToken) {
      throw new UnauthorizedException(
        ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN,
      );
    }

    return {
      userId: payload.sub,
      refreshToken,
    };
  }
}
