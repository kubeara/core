import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { AuthSessionsEntity } from "../entities/auth-sessions.entity";
import { verifyTokenHash } from "../utils/token-hash.util";

@Injectable()
export class AuthSessionLookupService {
  private readonly logger = new Logger(AuthSessionLookupService.name);

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
    try {
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
    } catch (error) {
      this.logger.error(
        `Find active session by access token failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Find a session by refresh token
   */
  async findSessionByRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<AuthSessionsEntity | null> {
    try {
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
    } catch (error) {
      this.logger.error(
        `Find session by refresh token failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }
}
