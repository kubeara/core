import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";

import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { McpApiKeysService } from "@control-panel/modules/mcp-api-keys/services/mcp-api-keys.service";
import { McpOAuthJwtService } from "@control-panel/modules/mcp-oauth/services/mcp-oauth-jwt.service";

import { McpAuthUser } from "../interfaces/mcp-auth-user.interface";

@Injectable()
export class McpAuthService {
  private readonly logger = new Logger(McpAuthService.name);

  constructor(
    private readonly mcpApiKeysService: McpApiKeysService,
    private readonly mcpOAuthJwtService: McpOAuthJwtService,
  ) {}

  /**
   * Validate MCP bearer credentials — API keys (desktop clients) or OAuth JWTs (ChatGPT).
   */
  async validateToken(authHeader: string | undefined): Promise<McpAuthUser> {
    try {
      const token = this.extractBearerToken(authHeader);
      if (!token) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_API_KEYS.MISSING_AUTHORIZATION,
        );
      }

      if (this.looksLikeJwt(token)) {
        return await this.mcpOAuthJwtService.verifyAccessToken(token);
      }

      return await this.mcpApiKeysService.validateBearerToken(token);
    } catch (error) {
      this.logger.error(
        `MCP token validation failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Whether a 401 should advertise OAuth metadata (ChatGPT) vs a plain API-key error (desktop clients).
   */
  shouldAdvertiseOAuthDiscovery(authHeader: string | undefined): boolean {
    const token = this.extractBearerToken(authHeader);
    if (!token) {
      return true;
    }

    // Desktop clients send opaque API keys; invalid keys should not trigger OAuth registration.
    return this.looksLikeJwt(token);
  }

  extractBearerToken(authHeader: string | undefined): string | undefined {
    if (!authHeader?.trim()) {
      return undefined;
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private looksLikeJwt(token: string): boolean {
    return token.split(".").length === 3;
  }
}
