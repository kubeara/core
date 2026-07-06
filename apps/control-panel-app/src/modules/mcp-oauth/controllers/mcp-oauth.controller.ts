import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";

import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { AuthenticatedRequest } from "@control-panel/common/interfaces/authenticated-request.interface";
import { AccessTokenGuard } from "@control-panel/modules/auth/guards/auth.guards";

import { MCP_OAUTH_WELL_KNOWN_PATHS } from "../constants/mcp-oauth-routes.constants";
import { McpOAuthApproveDto } from "../dto/mcp-oauth-approve.dto";
import { McpOAuthAuthorizeService } from "../services/mcp-oauth-authorize.service";
import { McpOAuthConfigService } from "../services/mcp-oauth-config.service";
import { McpOAuthTokenService } from "../services/mcp-oauth-token.service";

@Controller()
export class McpOAuthMetadataController {
  constructor(private readonly config: McpOAuthConfigService) {}

  /**
   * Get the protected resource metadata
   * @param res
   */
  @Get(MCP_OAUTH_WELL_KNOWN_PATHS.protectedResource)
  getProtectedResourceMetadata(@Res() res: Response): void {
    res.status(200).json(this.config.getProtectedResourceMetadata());
  }

  /**
   * Get the authorization server metadata
   * @param res
   */
  @Get(MCP_OAUTH_WELL_KNOWN_PATHS.authorizationServer)
  getAuthorizationServerMetadata(@Res() res: Response): void {
    res.status(200).json(this.config.getAuthorizationServerMetadata());
  }

  /**
   * Get the authorization server metadata with resource
   * @param res
   */
  @Get(MCP_OAUTH_WELL_KNOWN_PATHS.authorizationServerWithResource)
  getAuthorizationServerMetadataWithResource(@Res() res: Response): void {
    res.status(200).json(this.config.getAuthorizationServerMetadata());
  }

  /**
   * Get the open id configuration
   * @param res
   */
  @Get(MCP_OAUTH_WELL_KNOWN_PATHS.openIdConfiguration)
  getOpenIdConfiguration(@Res() res: Response): void {
    res.status(200).json(this.config.getOpenIdConfiguration());
  }

  /**
   * Get the open id configuration with resource
   * @param res
   */
  @Get(MCP_OAUTH_WELL_KNOWN_PATHS.openIdConfigurationWithResource)
  getOpenIdConfigurationWithResource(@Res() res: Response): void {
    res.status(200).json(this.config.getOpenIdConfiguration());
  }
}

/**
 * McpOAuthController
 */
@Controller("oauth")
export class McpOAuthController {
  constructor(
    private readonly authorizeService: McpOAuthAuthorizeService,
    private readonly tokenService: McpOAuthTokenService,
  ) {}

  /**
   * Redirect ChatGPT OAuth requests to the console SPA authorize page.
   */
  @Get("authorize")
  async handleAuthorizeGet(
    @Query() query: Record<string, string | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const redirectUrl =
        await this.authorizeService.buildConsoleAuthorizeRedirectUrl(query);
      res.redirect(302, redirectUrl);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.MCP_OAUTH.INVALID_AUTHORIZE_REQUEST;
      res.status(400).type("text/plain").send(message);
    }
  }

  /**
   * Complete OAuth authorization for a signed-in console user.
   */
  @UseGuards(AccessTokenGuard)
  @Post("authorize/approve")
  async handleAuthorizeApprove(
    @Req() req: AuthenticatedRequest,
    @Body() body: McpOAuthApproveDto,
  ): Promise<ServiceResponse<{ redirectUrl: string }>> {
    const result = await this.authorizeService.approveForUser(
      req.user.id,
      body,
    );

    return {
      message: "Authorization approved",
      data: result,
    };
  }

  /**
   * Handle the token POST request
   * @param req
   * @param res
   */
  @Post("token")
  async handleToken(@Req() req: Request, @Res() res: Response): Promise<void> {
    const body = req.body as Record<string, string | undefined>;

    try {
      const tokenResponse =
        body.grant_type?.trim() === "refresh_token"
          ? await this.tokenService.refreshAccessToken(body)
          : await this.tokenService.exchangeAuthorizationCode(body);

      res.status(200).json(tokenResponse);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.MCP_OAUTH.INVALID_TOKEN_REQUEST;
      res.status(401).json({
        error: "invalid_grant",
        error_description: message,
      });
    }
  }
}
