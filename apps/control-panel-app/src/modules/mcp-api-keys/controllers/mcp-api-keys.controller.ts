import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

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
  constructor(private readonly mcpApiKeysService: McpApiKeysService) {}

  /**
   * Create a new MCP API key for the authenticated user.
   * @param req
   * @param body
   * @returns
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createKey(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateMcpApiKeyDto,
  ): Promise<ServiceResponse<CreateMcpApiKeyResult>> {
    return this.mcpApiKeysService.createKey(req.user.id, body);
  }

  /**
   * List MCP API keys for the authenticated user.
   * @param req
   * @returns
   */
  @Get()
  listKeys(
    @Req() req: AuthenticatedRequest,
  ): Promise<ServiceResponse<McpApiKeyListItem[]>> {
    return this.mcpApiKeysService.listKeys(req.user.id);
  }

  /**
   * Revoke an MCP API key owned by the authenticated user.
   * @param req
   * @param keyId
   * @returns
   */
  @Delete(":id")
  revokeKey(
    @Req() req: AuthenticatedRequest,
    @Param("id") keyId: string,
  ): Promise<ServiceResponse<null>> {
    return this.mcpApiKeysService.revokeKey(req.user.id, keyId);
  }
}
