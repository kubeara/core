import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { tokenType } from "../enum/tokenType.enum";
import { UsersService } from "@control-panel/modules/users/users.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly userService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_SECRET"),
    });
  }

  /*
   * Validate the payload from the JWT access token and return the associated user.
   */
  async validate(payload: { sub: string; email: string; tokenType?: string }) {
    if (payload.tokenType !== tokenType.ACCESS) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const user = await this.userService.findOne({
      where: { id: payload.sub },
      relations: { organization: true },
    });

    if (!user || user.status !== EntityStatus.ACTIVE) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    return user;
  }
}
