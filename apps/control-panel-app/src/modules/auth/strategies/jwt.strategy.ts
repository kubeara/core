import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { EntityStatus } from "@control-panel/common/entity/base.entity";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        "JWT_SECRET",
        "super-secret-jwt-key",
      ),
    });
  }

  /*
   * Validate the payload from the JWT access token and return the associated user.
   */
  async validate(payload: { sub: string; email: string; tokenType?: string }) {
    if (payload.tokenType !== "ACCESS") {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: { organization: true },
    });

    if (!user || user.status !== EntityStatus.ACTIVE) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    return user;
  }
}
