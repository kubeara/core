import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import dayjs from "dayjs";
import { randomBytes } from "crypto";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { hashToken } from "@control-panel/modules/auth/utils/token-hash.util";

import {
  MCP_OAUTH_GRANT_TYPES,
  MCP_OAUTH_DEFAULT_SCOPES,
} from "../constants/mcp-oauth.constants";
import { McpOAuthAuthorizationCodeEntity } from "../entities/mcp-oauth-authorization-code.entity";
import { McpOAuthRefreshTokenEntity } from "../entities/mcp-oauth-refresh-token.entity";
import { verifyPkceChallenge } from "../utils/pkce.util";
import { McpOAuthAuthorizeService } from "./mcp-oauth-authorize.service";
import { McpOAuthConfigService } from "./mcp-oauth-config.service";
import { McpOAuthJwtService } from "./mcp-oauth-jwt.service";

export interface McpOAuthTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

@Injectable()
export class McpOAuthTokenService {
  constructor(
    private readonly config: McpOAuthConfigService,
    private readonly authorizeService: McpOAuthAuthorizeService,
    private readonly jwtService: McpOAuthJwtService,
    @InjectRepository(McpOAuthAuthorizationCodeEntity)
    private readonly authorizationCodeRepository: Repository<McpOAuthAuthorizationCodeEntity>,
    @InjectRepository(McpOAuthRefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<McpOAuthRefreshTokenEntity>,
  ) {}

  /**
   * Exchange the authorization code
   * @param body
   * @returns The token response
   */
  async exchangeAuthorizationCode(
    body: Record<string, string | undefined>,
  ): Promise<McpOAuthTokenResponse> {
    try {
      if (
        body.grant_type?.trim() !== MCP_OAUTH_GRANT_TYPES.AUTHORIZATION_CODE
      ) {
        throw new BadRequestException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_GRANT_TYPE,
        );
      }

      const code = body.code?.trim();
      const redirectUri = body.redirect_uri?.trim();
      const clientId = body.client_id?.trim();
      const codeVerifier = body.code_verifier?.trim();
      const resource = body.resource?.trim() ?? this.config.getResource();

      if (!code || !redirectUri || !clientId || !codeVerifier) {
        throw new BadRequestException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_TOKEN_REQUEST,
        );
      }

      this.authorizeService.assertChatGptClient(clientId, redirectUri);
      this.authorizeService.assertResource(resource);

      const authCode = await this.authorizationCodeRepository.findOne({
        where: { codeHash: hashToken(code), status: EntityStatus.ACTIVE },
      });

      if (!authCode || authCode.usedAt !== null) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_AUTHORIZATION_CODE,
        );
      }

      if (authCode.expiresAt < dayjs().unix()) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_OAUTH.AUTHORIZATION_CODE_EXPIRED,
        );
      }

      if (
        authCode.redirectUri !== redirectUri ||
        authCode.clientId !== clientId ||
        authCode.resource !== resource
      ) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_AUTHORIZATION_CODE,
        );
      }

      if (
        !verifyPkceChallenge(
          codeVerifier,
          authCode.codeChallenge,
          authCode.codeChallengeMethod,
        )
      ) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_CODE_VERIFIER,
        );
      }

      authCode.usedAt = dayjs().unix();
      await this.authorizationCodeRepository.save(authCode);

      const scopes = authCode.scopes.split(/\s+/).filter(Boolean);
      return this.issueTokens(authCode.userId, clientId, resource, scopes);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.MCP_OAUTH.INVALID_TOKEN_REQUEST,
      );
    }
  }

  /**
   * Refresh the access token
   * @param body
   * @returns The token response
   */
  async refreshAccessToken(
    body: Record<string, string | undefined>,
  ): Promise<McpOAuthTokenResponse> {
    try {
      if (body.grant_type?.trim() !== MCP_OAUTH_GRANT_TYPES.REFRESH_TOKEN) {
        throw new BadRequestException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_GRANT_TYPE,
        );
      }

      const refreshToken = body.refresh_token?.trim();
      const resource = body.resource?.trim() ?? this.config.getResource();

      if (!refreshToken) {
        throw new BadRequestException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_TOKEN_REQUEST,
        );
      }

      this.authorizeService.assertResource(resource);

      const stored = await this.refreshTokenRepository.findOne({
        where: {
          tokenHash: hashToken(refreshToken),
          status: EntityStatus.ACTIVE,
        },
      });

      if (!stored || stored.revokedAt !== null) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_REFRESH_TOKEN,
        );
      }

      if (stored.expiresAt < dayjs().unix()) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_OAUTH.REFRESH_TOKEN_EXPIRED,
        );
      }

      if (stored.resource !== resource) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_REFRESH_TOKEN,
        );
      }

      stored.revokedAt = dayjs().unix();
      await this.refreshTokenRepository.save(stored);

      const scopes = stored.scopes.split(/\s+/).filter(Boolean);
      return this.issueTokens(stored.userId, stored.clientId, resource, scopes);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.MCP_OAUTH.INVALID_TOKEN_REQUEST,
      );
    }
  }

  /**
   * Issue the tokens
   * @param userId
   * @param clientId
   * @param resource
   * @param scopes
   * @returns The token response
   */
  private async issueTokens(
    userId: string,
    clientId: string,
    resource: string,
    scopes: string[],
  ): Promise<McpOAuthTokenResponse> {
    try {
      const normalizedScopes =
        scopes.length > 0 ? scopes : [...MCP_OAUTH_DEFAULT_SCOPES];

      const access = await this.jwtService.signAccessToken(
        userId,
        normalizedScopes,
      );

      const refreshToken = randomBytes(48).toString("base64url");
      await this.refreshTokenRepository.save(
        this.refreshTokenRepository.create({
          tokenHash: hashToken(refreshToken),
          userId,
          clientId,
          resource,
          scopes: normalizedScopes.join(" "),
          expiresAt: this.jwtService.getRefreshTokenExpiresAt(),
          revokedAt: null,
        }),
      );

      return {
        access_token: access.accessToken,
        token_type: "Bearer",
        expires_in: access.expiresIn,
        refresh_token: refreshToken,
        scope: access.scope,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.MCP_OAUTH.INVALID_TOKEN_REQUEST,
      );
    }
  }
}
