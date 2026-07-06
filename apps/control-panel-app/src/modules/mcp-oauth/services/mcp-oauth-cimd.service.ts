import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import dayjs from "dayjs";

import { ERROR_MESSAGES } from "@control-panel/constants/error";

import { MCP_OAUTH_CIMD_CACHE_TTL_SECONDS } from "../constants/mcp-oauth.constants";
import { McpOAuthCimdMetadata } from "../interfaces/mcp-oauth-cimd-metadata.interface";
import {
  buildTrustedCimdMetadataUrl,
  resolveTrustedCimdFetchTarget,
} from "../utils/parse-cimd-client-id-url.util";

type CachedCimdMetadata = {
  redirectUris: string[];
  expiresAt: number;
};

@Injectable()
export class McpOAuthCimdService {
  private readonly logger = new Logger(McpOAuthCimdService.name);
  private readonly cache = new Map<string, CachedCimdMetadata>();

  /**
   * Validates the client ID and redirect URI against the CIMD metadata.
   */
  async validate(clientId: string, redirectUri: string): Promise<void> {
    const cached = this.cache.get(clientId);
    if (cached && cached.expiresAt > dayjs().unix()) {
      this.assertRedirectUriAllowed(redirectUri, cached.redirectUris);
      return;
    }

    const metadata = await this.fetchMetadata(clientId);
    this.assertMetadataMatchesClientId(clientId, metadata);
    this.assertRedirectUriAllowed(redirectUri, metadata.redirect_uris);

    this.cache.set(clientId, {
      redirectUris: metadata.redirect_uris,
      expiresAt: dayjs().unix() + MCP_OAUTH_CIMD_CACHE_TTL_SECONDS,
    });
  }

  private async fetchMetadata(clientId: string): Promise<McpOAuthCimdMetadata> {
    const metadataUrl = buildTrustedCimdMetadataUrl(
      resolveTrustedCimdFetchTarget(clientId),
    );

    try {
      const { data: metadata } = await axios.get<McpOAuthCimdMetadata>(
        metadataUrl.toString(),
        {
          timeout: 10_000,
          maxRedirects: 0,
          headers: { Accept: "application/json" },
        },
      );

      if (
        typeof metadata.client_id !== "string" ||
        !Array.isArray(metadata.redirect_uris) ||
        metadata.redirect_uris.some((uri) => typeof uri !== "string")
      ) {
        throw new BadRequestException(
          ERROR_MESSAGES.MCP_OAUTH.INVALID_CIMD_CLIENT_ID,
        );
      }

      return metadata;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.warn(
        `Failed to fetch CIMD metadata for ${clientId}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      throw new BadRequestException(ERROR_MESSAGES.MCP_OAUTH.CIMD_FETCH_FAILED);
    }
  }

  private assertMetadataMatchesClientId(
    clientId: string,
    metadata: McpOAuthCimdMetadata,
  ): void {
    if (metadata.client_id !== clientId) {
      throw new BadRequestException(
        ERROR_MESSAGES.MCP_OAUTH.INVALID_CIMD_CLIENT_ID,
      );
    }
  }

  private assertRedirectUriAllowed(
    redirectUri: string,
    allowedRedirectUris: string[],
  ): void {
    if (!allowedRedirectUris.includes(redirectUri)) {
      throw new BadRequestException(
        ERROR_MESSAGES.MCP_OAUTH.CIMD_REDIRECT_URI_MISMATCH,
      );
    }
  }
}
