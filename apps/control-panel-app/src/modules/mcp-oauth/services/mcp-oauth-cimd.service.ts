import { BadRequestException, Injectable, Logger } from "@nestjs/common";
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
      const response = await fetch(metadataUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new BadRequestException(
          ERROR_MESSAGES.MCP_OAUTH.CIMD_FETCH_FAILED,
        );
      }

      const metadata: unknown = await response.json();
      return this.parseCimdMetadata(metadata);
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

  private parseCimdMetadata(metadata: unknown): McpOAuthCimdMetadata {
    if (typeof metadata !== "object" || metadata === null) {
      throw new BadRequestException(
        ERROR_MESSAGES.MCP_OAUTH.INVALID_CIMD_CLIENT_ID,
      );
    }

    const record = metadata as Record<string, unknown>;
    const {
      client_id,
      redirect_uris,
      client_name,
      token_endpoint_auth_method,
    } = record;

    if (typeof client_id !== "string" || !this.isStringArray(redirect_uris)) {
      throw new BadRequestException(
        ERROR_MESSAGES.MCP_OAUTH.INVALID_CIMD_CLIENT_ID,
      );
    }

    const parsed: McpOAuthCimdMetadata = {
      client_id,
      redirect_uris,
    };

    if (typeof client_name === "string") {
      parsed.client_name = client_name;
    }

    if (typeof token_endpoint_auth_method === "string") {
      parsed.token_endpoint_auth_method = token_endpoint_auth_method;
    }

    return parsed;
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === "string")
    );
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
