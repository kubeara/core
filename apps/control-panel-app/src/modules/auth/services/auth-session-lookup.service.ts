import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { AuthSessionsEntity } from "../entities/auth-sessions.entity";
import { verifyTokenHash } from "../utils/token-hash.util";

@Injectable()
export class AuthSessionLookupService {
  constructor(
    @InjectRepository(AuthSessionsEntity)
    private readonly authSessionRepository: Repository<AuthSessionsEntity>,
  ) {}

  /**
   * Find an active session by access token
   */
  async findActiveSessionByAccessToken(
    userId: string,
    accessToken: string,
  ): Promise<AuthSessionsEntity | null> {
    const sessions = await this.authSessionRepository.find({
      where: {
        userId,
        status: EntityStatus.ACTIVE,
      },
    });

    const session = sessions.find((session) =>
      verifyTokenHash(accessToken, session.accessToken),
    );

    if (!session) {
      return null;
    }

    return session;
  }

  /**
   * Find a session by refresh token
   */
  async findSessionByRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<AuthSessionsEntity | null> {
    const sessions = await this.authSessionRepository.find({
      where: {
        userId,
      },
    });

    const session = sessions.find((session) =>
      verifyTokenHash(refreshToken, session.refreshToken),
    );

    if (!session) {
      return null;
    }

    return session;
  }
}
