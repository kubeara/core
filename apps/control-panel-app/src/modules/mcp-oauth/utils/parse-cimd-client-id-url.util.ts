import { BadRequestException } from "@nestjs/common";

import { ERROR_MESSAGES } from "@control-panel/constants/error";

import { MCP_OAUTH_CIMD_ALLOWED_HOSTS } from "../constants/mcp-oauth.constants";

const allowedCimdHosts = new Set<string>(MCP_OAUTH_CIMD_ALLOWED_HOSTS);

/**
 * Parse and harden a ChatGPT CIMD client_id URL before server-side fetch (SSRF guard).
 */
export function parseCimdClientIdUrl(clientId: string): URL {
  let url: URL;

  try {
    url = new URL(clientId);
  } catch {
    throw new BadRequestException(
      ERROR_MESSAGES.MCP_OAUTH.INVALID_CIMD_CLIENT_ID,
    );
  }

  if (
    url.protocol !== "https:" ||
    !allowedCimdHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.length <= 1
  ) {
    throw new BadRequestException(
      ERROR_MESSAGES.MCP_OAUTH.INVALID_CIMD_CLIENT_ID,
    );
  }

  return url;
}
