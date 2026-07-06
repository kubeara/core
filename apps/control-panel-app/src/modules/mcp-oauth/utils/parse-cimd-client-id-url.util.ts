import { BadRequestException } from "@nestjs/common";

import { ERROR_MESSAGES } from "@control-panel/constants/error";

import { MCP_OAUTH_CIMD_ALLOWED_HOSTS } from "../constants/mcp-oauth.constants";

const allowedCimdHosts = new Set<string>(MCP_OAUTH_CIMD_ALLOWED_HOSTS);

const CIMD_PATH_PATTERN = /^\/[A-Za-z0-9._~/-]+$/;

function invalidCimdClientId(): never {
  throw new BadRequestException(
    ERROR_MESSAGES.MCP_OAUTH.INVALID_CIMD_CLIENT_ID,
  );
}

/**
 * Parse a ChatGPT CIMD client_id URL and rebuild it from trusted host literals (SSRF guard).
 */
export function parseCimdClientIdUrl(clientId: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(clientId);
  } catch {
    invalidCimdClientId();
  }

  if (
    parsed.protocol !== "https:" ||
    !allowedCimdHosts.has(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname.length <= 1 ||
    parsed.pathname.includes("..") ||
    !CIMD_PATH_PATTERN.test(parsed.pathname)
  ) {
    invalidCimdClientId();
  }

  switch (parsed.hostname) {
    case "chatgpt.com":
      return new URL(parsed.pathname, "https://chatgpt.com/");
    case "chat.openai.com":
      return new URL(parsed.pathname, "https://chat.openai.com/");
    default:
      return invalidCimdClientId();
  }
}
