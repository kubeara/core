import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";

import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { McpApiKeysService } from "@control-panel/modules/mcp-api-keys/services/mcp-api-keys.service";

import { McpAuthUser } from "../interfaces/mcp-auth-user.interface";

@Injectable()
export class McpAuthService {
  private readonly logger = new Logger(McpAuthService.name);

  constructor(private readonly mcpApiKeysService: McpApiKeysService) {}

  /**
   * Validate the MCP bearer token against stored API keys and returns the owning user.
   * @param authHeader
   * @returns A promise that resolves to the MCP auth user.
   */
  async validateToken(authHeader: string | undefined): Promise<McpAuthUser> {
    try {
      if (!authHeader) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_API_KEYS.MISSING_AUTHORIZATION,
        );
      }

      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

      if (!token.trim()) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_API_KEYS.MISSING_AUTHORIZATION,
        );
      }

      return await this.mcpApiKeysService.validateBearerToken(token);
    } catch (error) {
      this.logger.error(
        `MCP token validation failed: ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }
}
