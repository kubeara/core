import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import dayjs from "dayjs";
import ms from "ms";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { UserEntity } from "@control-panel/modules/users/entities/users.entity";
import { McpAuthUser } from "@control-panel/modules/mcp-server/interfaces/mcp-auth-user.interface";

import { MCP_OAUTH_TOKEN_TYPE } from "../constants/mcp-oauth.constants";
import { McpOAuthJwtPayload } from "../interfaces/mcp-oauth-jwt-payload.interface";
import { McpOAuthConfigService } from "./mcp-oauth-config.service";

@Injectable()
export class McpOAuthJwtService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: McpOAuthConfigService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Sign the access token
   * @param userId
   * @param scopes
   * @returns The access token
   */
  async signAccessToken(
    userId: string,
    scopes: string[],
  ): Promise<{ accessToken: string; expiresIn: number; scope: string }> {
    try {
      const expiresInConfig = this.config.getAccessTokenExpiresIn();
      const expiresInMs = ms(expiresInConfig);
      if (typeof expiresInMs !== "number") {
        throw new Error(
          `Invalid MCP OAuth access token expiry: ${expiresInConfig}`,
        );
      }

      const scope = scopes.join(" ");
      const payload: McpOAuthJwtPayload = {
        sub: userId,
        iss: this.config.getIssuer(),
        aud: this.config.getResource(),
        scope,
        tokenType: MCP_OAUTH_TOKEN_TYPE,
      };

      const accessToken = await this.jwtService.signAsync(payload, {
        secret: this.config.getJwtSecret(),
        expiresIn: expiresInConfig,
      });

      return {
        accessToken,
        expiresIn: Math.floor(expiresInMs / 1000),
        scope,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.MCP_OAUTH.INVALID_ACCESS_TOKEN,
      );
    }
  }

  /**
   * Verify the access token
   * @param token
   * @returns The MCP auth user
   */
  async verifyAccessToken(token: string): Promise<McpAuthUser> {
    let payload: McpOAuthJwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<McpOAuthJwtPayload>(token, {
        secret: this.config.getJwtSecret(),
      });
    } catch {
      throw new UnauthorizedException(
        ERROR_MESSAGES.MCP_OAUTH.INVALID_ACCESS_TOKEN,
      );
    }

    if (
      payload.tokenType !== MCP_OAUTH_TOKEN_TYPE ||
      payload.iss !== this.config.getIssuer() ||
      payload.aud !== this.config.getResource()
    ) {
      throw new UnauthorizedException(
        ERROR_MESSAGES.MCP_OAUTH.INVALID_ACCESS_TOKEN,
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user || user.status !== EntityStatus.ACTIVE) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
    }

    return { id: user.id, name: user.name };
  }

  /**
   * Get the refresh token expires at
   * @returns The refresh token expires at
   */
  getRefreshTokenExpiresAt(): number {
    try {
      const expiresInMs = ms(this.config.getRefreshTokenExpiresIn());
      if (typeof expiresInMs !== "number") {
        throw new Error("Invalid MCP OAuth refresh token expiry");
      }
      return dayjs().add(expiresInMs, "millisecond").unix();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.MCP_OAUTH.INVALID_REFRESH_TOKEN,
      );
    }
  }
}
