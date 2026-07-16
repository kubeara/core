import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import dayjs from "dayjs";
import { randomBytes } from "crypto";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { hashToken } from "@control-panel/modules/auth/utils/token-hash.util";

import {
  MCP_OAUTH_CHATGPT_CLIENT_ID_PREFIX,
  MCP_OAUTH_CHATGPT_REDIRECT_PREFIX,
  MCP_OAUTH_CODE_CHALLENGE_METHOD,
  MCP_OAUTH_DEFAULT_SCOPES,
} from "../constants/mcp-oauth.constants";
import { McpOAuthAuthorizationCodeEntity } from "../entities/mcp-oauth-authorization-code.entity";
import { McpOAuthApproveDto } from "../dto/mcp-oauth-approve.dto";
import { McpOAuthAuthorizeParams } from "../interfaces/mcp-oauth-authorize-params.interface";
import { isCimdClientId } from "../utils/is-cimd-client-id.util";
import { McpOAuthCimdService } from "./mcp-oauth-cimd.service";
import { McpOAuthConfigService } from "./mcp-oauth-config.service";

@Injectable()
export class McpOAuthAuthorizeService {
  constructor(
    private readonly config: McpOAuthConfigService,
    private readonly cimdService: McpOAuthCimdService,
    @InjectRepository(McpOAuthAuthorizationCodeEntity)
    private readonly authorizationCodeRepository: Repository<McpOAuthAuthorizationCodeEntity>,
  ) {}

  /**
   * Parse the authorize query
   * @param query
   * @returns The authorize params
   */
  async parseAuthorizeQuery(
    query: Record<string, string | undefined>,
  ): Promise<McpOAuthAuthorizeParams> {
    try {
      const responseType = query.response_type?.trim();
      const clientId = query.client_id?.trim();
      const redirectUri = query.redirect_uri?.trim();
      const scope = query.scope?.trim() || MCP_OAUTH_DEFAULT_SCOPES.join(" ");
      const state = query.state?.trim();
      const codeChallenge = query.code_challenge?.trim();
      const codeChallengeMethod = query.code_challenge_method?.trim();
      const resource = query.resource?.trim() || this.config.getResource();

      if (responseType !== "code") {
        throw new BadRequestException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_RESPONSE_TYPE,
        );
      }

      if (
        !clientId ||
        !redirectUri ||
        !state ||
        !codeChallenge ||
        !codeChallengeMethod
      ) {
        throw new BadRequestException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_AUTHORIZE_REQUEST,
        );
      }

      await this.assertChatGptClient(clientId, redirectUri);
      this.assertResource(resource);

      if (codeChallengeMethod !== MCP_OAUTH_CODE_CHALLENGE_METHOD) {
        throw new BadRequestException(
          ERROR_MESSAGES.MCP_OAUTH.UNSUPPORTED_CODE_CHALLENGE,
        );
      }

      return {
        responseType,
        clientId,
        redirectUri,
        scope,
        state,
        codeChallenge,
        codeChallengeMethod,
        resource,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.MCP_OAUTH.INVALID_AUTHORIZE_REQUEST,
      );
    }
  }

  /**
   * Build the console authorize URL for redirecting the user to the SPA login/consent flow.
   */
  async buildConsoleAuthorizeRedirectUrl(
    query: Record<string, string | undefined>,
  ): Promise<string> {
    const params = await this.parseAuthorizeQuery(query);

    return this.config.getConsoleAuthorizeUrl({
      response_type: params.responseType,
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      scope: params.scope,
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod,
      resource: params.resource,
    });
  }

  /**
   * Approve OAuth authorization for an already authenticated console user.
   */
  async approveForUser(
    userId: string,
    body: McpOAuthApproveDto,
  ): Promise<{ redirectUrl: string }> {
    const params = await this.parseAuthorizeQuery({
      ...body,
    });
    return this.createAuthorizationCode(params, userId);
  }

  /**
   * Assert the ChatGPT OAuth client (CIMD URL or legacy static client_id).
   */
  async assertChatGptClient(
    clientId: string,
    redirectUri: string,
  ): Promise<void> {
    if (!redirectUri.startsWith(MCP_OAUTH_CHATGPT_REDIRECT_PREFIX)) {
      throw new BadRequestException(
        ERROR_MESSAGES.MCP_OAUTH.INVALID_REDIRECT_URI,
      );
    }

    if (isCimdClientId(clientId)) {
      await this.cimdService.validate(clientId, redirectUri);
      return;
    }

    if (!clientId.startsWith(MCP_OAUTH_CHATGPT_CLIENT_ID_PREFIX)) {
      throw new BadRequestException(ERROR_MESSAGES.MCP_OAUTH.INVALID_CLIENT_ID);
    }
  }

  /**
   * Assert the resource
   * @param resource
   */
  assertResource(resource: string): void {
    if (resource !== this.config.getResource()) {
      throw new BadRequestException(ERROR_MESSAGES.MCP_OAUTH.INVALID_RESOURCE);
    }
  }

  /**
   * Create the authorization code
   * @param params
   * @param userId
   * @returns The redirect URL
   */
  private async createAuthorizationCode(
    params: McpOAuthAuthorizeParams,
    userId: string,
  ): Promise<{ redirectUrl: string }> {
    const code = randomBytes(32).toString("base64url");
    const expiresAt = dayjs()
      .add(this.config.getAuthorizationCodeExpiresInSeconds(), "second")
      .unix();

    await this.authorizationCodeRepository.save(
      this.authorizationCodeRepository.create({
        codeHash: hashToken(code),
        userId,
        codeChallenge: params.codeChallenge,
        codeChallengeMethod: params.codeChallengeMethod,
        redirectUri: params.redirectUri,
        clientId: params.clientId,
        resource: params.resource,
        scopes: params.scope,
        expiresAt,
        usedAt: null,
      }),
    );

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    redirectUrl.searchParams.set("state", params.state);

    return { redirectUrl: redirectUrl.toString() };
  }
}
