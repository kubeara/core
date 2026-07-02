import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StringValue } from "ms";

import { MCP_OAUTH_DEFAULT_SCOPES } from "../constants/mcp-oauth.constants";

@Injectable()
export class McpOAuthConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get the issuer
   * @returns The issuer
   */
  getIssuer(): string {
    const configured = this.configService.get<string>("MCP_OAUTH_ISSUER");
    if (configured?.trim()) {
      return configured.trim().replace(/\/$/, "");
    }

    const controlPanelUrl =
      this.configService.getOrThrow<string>("CONTROL_PANEL_URL");
    return controlPanelUrl.trim().replace(/\/$/, "");
  }
  /**
   * Get the resource
   * @returns The resource
   */
  getResource(): string {
    const configured = this.configService.get<string>("MCP_OAUTH_RESOURCE");
    if (configured?.trim()) {
      return configured.trim().replace(/\/$/, "");
    }

    return `${this.getIssuer()}/api/mcp`;
  }

  /**
   * Get the protected resource metadata URL
   * @returns The protected resource metadata URL
   */
  getProtectedResourceMetadataUrl(): string {
    const resourcePath = new URL(this.getResource()).pathname.replace(
      /\/$/,
      "",
    );
    return `${this.getIssuer()}/.well-known/oauth-protected-resource${resourcePath}`;
  }

  /**
   * Get the authorization endpoint
   * @returns The authorization endpoint
   */
  getAuthorizationEndpoint(): string {
    return `${this.getIssuer()}/oauth/authorize`;
  }

  /**
   * Get the token endpoint
   * @returns The token endpoint
   */
  getTokenEndpoint(): string {
    return `${this.getIssuer()}/oauth/token`;
  }

  /**
   * Console SPA origin used for the OAuth login/consent UI.
   */
  getConsoleUrl(): string {
    const configured = this.configService.get<string>("CONSOLE_URL");
    if (configured?.trim()) {
      return configured.trim().replace(/\/$/, "");
    }

    return "http://localhost:8080";
  }

  /**
   * Frontend route that handles MCP OAuth consent after redirect from /oauth/authorize.
   */
  getConsoleAuthorizeUrl(params: Record<string, string>): string {
    const url = new URL("/oauth/authorize", this.getConsoleUrl());
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  /**
   * Get the access token expires in
   * @returns The access token expires in
   */
  getAccessTokenExpiresIn(): StringValue {
    return (
      this.configService.get<StringValue>(
        "MCP_OAUTH_ACCESS_TOKEN_EXPIRES_IN",
      ) ?? "1h"
    );
  }

  /**
   * Get the refresh token expires in
   * @returns The refresh token expires in
   */
  getRefreshTokenExpiresIn(): StringValue {
    return (
      this.configService.get<StringValue>(
        "MCP_OAUTH_REFRESH_TOKEN_EXPIRES_IN",
      ) ?? "30d"
    );
  }

  /**
   * Get the authorization code expires in seconds
   * @returns The authorization code expires in seconds
   */
  getAuthorizationCodeExpiresInSeconds(): number {
    const configured = this.configService.get<string>(
      "MCP_OAUTH_CODE_EXPIRES_IN_SECONDS",
    );
    if (configured) {
      const parsed = Number(configured);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 300;
  }

  /**
   * Get the JWT secret
   * @returns The JWT secret
   */
  getJwtSecret(): string {
    return (
      this.configService.get<string>("MCP_OAUTH_JWT_SECRET") ??
      this.configService.getOrThrow<string>("JWT_SECRET")
    );
  }

  /**
   * Get the protected resource metadata
   * @returns The protected resource metadata
   */
  getProtectedResourceMetadata(): Record<string, unknown> {
    return {
      resource: this.getResource(),
      authorization_servers: [this.getIssuer()],
      scopes_supported: [...MCP_OAUTH_DEFAULT_SCOPES],
    };
  }

  /**
   * Get the authorization server metadata
   * @returns The authorization server metadata
   */
  getAuthorizationServerMetadata(): Record<string, unknown> {
    return {
      issuer: this.getIssuer(),
      authorization_endpoint: this.getAuthorizationEndpoint(),
      token_endpoint: this.getTokenEndpoint(),
      scopes_supported: [...MCP_OAUTH_DEFAULT_SCOPES],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    };
  }

  /**
   * Get the open id configuration
   * @returns The open id configuration
   */
  getOpenIdConfiguration(): Record<string, unknown> {
    return {
      ...this.getAuthorizationServerMetadata(),
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
    };
  }
}
