import { randomBytes } from "crypto";

import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import dayjs from "dayjs";
import { Repository } from "typeorm";

import { EntityStatus } from "@control-panel/common/entity/entity-status";
import { ServiceResponse } from "@control-panel/common/interfaces/success-response.interface";
import { ERROR_MESSAGES } from "@control-panel/constants/error";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { hashToken } from "@control-panel/modules/auth/utils/token-hash.util";
import { McpAuthUser } from "@control-panel/modules/mcp-server/interfaces/mcp-auth-user.interface";
import { SubscriptionService } from "@control-panel/modules/subscriptions/services/subscription.service";

import { MCP_API_KEY_SECRET_BYTES } from "../constants/mcp-api-key.constants";
import { CreateMcpApiKeyDto } from "../dto";
import { McpApiKeyEntity } from "../entities/mcp-api-key.entity";
import { CreateMcpApiKeyResult } from "../interfaces/create-mcp-api-key-result.interface";
import { McpApiKeyListItem } from "../interfaces/mcp-api-key-list-item.interface";

@Injectable()
export class McpApiKeysService {
  constructor(
    @InjectRepository(McpApiKeyEntity)
    private readonly mcpApiKeyRepository: Repository<McpApiKeyEntity>,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  /**
   * Create a new MCP API key for the authenticated user.
   * @param userId - The ID of the user.
   * @param dto - The data transfer object containing the MCP API key details.
   * @returns A service response containing the created MCP API key.
   */
  async createKey(
    userId: string,
    organizationId: string,
    dto: CreateMcpApiKeyDto,
  ): Promise<ServiceResponse<CreateMcpApiKeyResult>> {
    try {
      await this.subscriptionService.assertMcpAccess(organizationId, "read");

      const { token, keyHash } = this.generateApiKeyMaterial();

      const record = this.mcpApiKeyRepository.create({
        userId,
        keyHash,
        name: dto.name.trim(),
        lastUsedAt: null,
        status: EntityStatus.ACTIVE,
      });

      const saved = await this.mcpApiKeyRepository.save(record);

      return {
        message: SUCCESS_MESSAGES.MCP_API_KEYS.CREATED,
        data: {
          id: saved.id,
          name: saved.name,
          token,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to create MCP API key: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * List MCP API keys for the authenticated user.
   * @param userId - The ID of the user.
   * @returns A service response containing the list of MCP API keys.
   */
  async listKeys(
    userId: string,
  ): Promise<ServiceResponse<McpApiKeyListItem[]>> {
    try {
      const keys = await this.mcpApiKeyRepository.find({
        where: { userId },
        order: { createdAt: "DESC" },
      });

      return {
        message: SUCCESS_MESSAGES.MCP_API_KEYS.LIST,
        data: keys.map((key) => this.toListItem(key)),
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to list MCP API keys: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Revoke an MCP API key owned by the authenticated user.
   * @param userId - The ID of the user.
   * @param keyId - The ID of the MCP API key to revoke.
   * @returns A service response containing the revoked MCP API key.
   */
  async revokeKey(
    userId: string,
    keyId: string,
  ): Promise<ServiceResponse<null>> {
    try {
      const key = await this.mcpApiKeyRepository.findOne({
        where: { id: keyId, userId },
      });

      if (!key) {
        throw new NotFoundException(ERROR_MESSAGES.MCP_API_KEYS.NOT_FOUND);
      }

      if (key.status !== EntityStatus.ACTIVE) {
        return {
          message: SUCCESS_MESSAGES.MCP_API_KEYS.REVOKED,
          data: null,
        };
      }

      key.status = EntityStatus.INACTIVE;
      key.revokedAt = dayjs().unix();
      await this.mcpApiKeyRepository.save(key);

      return {
        message: SUCCESS_MESSAGES.MCP_API_KEYS.REVOKED,
        data: null,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to revoke MCP API key: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Validate a bearer token against stored key hashes and returns the owning user.
   * @param token - The bearer token to validate.
   * @returns A promise that resolves to the MCP auth user.
   */
  async validateBearerToken(token: string): Promise<McpAuthUser> {
    try {
      const keyHash = hashToken(token);

      const apiKey = await this.mcpApiKeyRepository.findOne({
        where: {
          keyHash,
          status: EntityStatus.ACTIVE,
        },
        relations: { user: true },
        select: {
          id: true,
          userId: true,
          user: { id: true, name: true },
        },
      });

      if (!apiKey) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.MCP_API_KEYS.INVALID_TOKEN,
        );
      }

      if (!apiKey.user) {
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      }

      await this.mcpApiKeyRepository.update(apiKey.id, {
        lastUsedAt: dayjs().unix(),
      });

      return {
        id: apiKey.user.id,
        name: apiKey.user.name,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to validate MCP API key: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generate API key material.
   * @returns An object containing the token and key hash.
   */
  private generateApiKeyMaterial(): {
    token: string;
    keyHash: string;
  } {
    const token = randomBytes(MCP_API_KEY_SECRET_BYTES).toString("base64url");
    const keyHash = hashToken(token);

    return { token, keyHash };
  }

  /**
   * Convert a MCP API key entity to a list item.
   * @param key - The MCP API key entity to convert.
   * @returns A MCP API key list item.
   */
  private toListItem(key: McpApiKeyEntity): McpApiKeyListItem {
    return {
      id: key.id,
      name: key.name,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      revokedAt: key.revokedAt,
      status: key.status,
    };
  }
}
