import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { tokenType } from "../enum/tokenType.enum";
import { UsersService } from "@control-panel/modules/users/users.service";
import { extractCookieToken } from "../utils/cookie-extractor.util";
import { AuthenticatedUser } from "../interfaces/authenticated-user.interface";
import { AuthSessionLookupService } from "../services/auth-session-lookup.service";
import { AuthCookieService } from "../services/auth-cookie.service";
import { TokenPayload } from "../interfaces/tokenPayload.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  private readonly accessTokenCookieName: string;

  constructor(
    configService: ConfigService,
    private readonly userService: UsersService,
    private readonly authSessionLookupService: AuthSessionLookupService,
    authCookieService: AuthCookieService,
  ) {
    const accessTokenCookieName = authCookieService.getAccessTokenCookieName();

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) =>
          extractCookieToken(req, accessTokenCookieName, { requireJwt: true }),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_SECRET"),
      passReqToCallback: true,
    });

    this.accessTokenCookieName = accessTokenCookieName;
  }

  /**
   * Validate the JWT token
   */
  async validate(
    req: Request,
    payload: TokenPayload,
  ): Promise<AuthenticatedUser> {
    if (payload.tokenType !== tokenType.ACCESS) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const accessToken = extractCookieToken(req, this.accessTokenCookieName, {
      requireJwt: true,
    });

    if (!accessToken) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const session =
      await this.authSessionLookupService.findActiveSessionByAccessToken(
        payload.sub,
        accessToken,
      );

    if (!session) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const user = await this.userService.findOne({
      where: { id: payload.sub },
      relations: { organization: true },
    });

    if (!user || user.status !== EntityStatus.ACTIVE) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    return Object.assign(user, { accessToken });
  }
}
