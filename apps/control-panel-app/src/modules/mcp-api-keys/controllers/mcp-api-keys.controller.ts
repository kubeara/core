import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { toErrorMessage } from "@control-panel/common/utils/error.util";
import { AuthenticatedRequest } from "@control-panel/common/interfaces/authenticated-request.interface";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { AccessTokenGuard } from "@control-panel/modules/auth/guards/auth.guards";

import { CreateMcpApiKeyDto } from "../dto";
import { CreateMcpApiKeyResult } from "../interfaces/create-mcp-api-key-result.interface";
import { McpApiKeyListItem } from "../interfaces/mcp-api-key-list-item.interface";
import { McpApiKeysService } from "../services/mcp-api-keys.service";

@UseGuards(AccessTokenGuard)
@Controller("mcp-api-keys")
export class McpApiKeysController {
  private readonly logger = new Logger(McpApiKeysController.name);

  constructor(private readonly mcpApiKeysService: McpApiKeysService) {}

  /**
   * Create a new MCP API key for the authenticated user.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createKey(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateMcpApiKeyDto,
  ): Promise<ServiceResponse<CreateMcpApiKeyResult>> {
    try {
      return await this.mcpApiKeysService.createKey(req.user.id, body);
    } catch (error) {
      this.logger.error(`Create MCP API key failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * List MCP API keys for the authenticated user.
   */
  @Get()
  async listKeys(
    @Req() req: AuthenticatedRequest,
  ): Promise<ServiceResponse<McpApiKeyListItem[]>> {
    try {
      return await this.mcpApiKeysService.listKeys(req.user.id);
    } catch (error) {
      this.logger.error(`List MCP API keys failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Revoke an MCP API key owned by the authenticated user.
   */
  @Delete(":id")
  async revokeKey(
    @Req() req: AuthenticatedRequest,
    @Param("id") keyId: string,
  ): Promise<ServiceResponse<null>> {
    try {
      return await this.mcpApiKeysService.revokeKey(req.user.id, keyId);
    } catch (error) {
      this.logger.error(`Revoke MCP API key failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
