import { BadRequestException } from "@nestjs/common";

import { ERROR_MESSAGES } from "@control-panel/constants/error";

import { MCP_OAUTH_CIMD_ALLOWED_HOSTS } from "../constants/mcp-oauth.constants";

const allowedCimdHosts = new Set<string>(MCP_OAUTH_CIMD_ALLOWED_HOSTS);

const CIMD_PATH_PATTERN = /^\/[A-Za-z0-9._~/-]+$/;

export type TrustedCimdFetchTarget = {
  host: (typeof MCP_OAUTH_CIMD_ALLOWED_HOSTS)[number];
  pathname: string;
};

function invalidCimdClientId(): never {
  throw new BadRequestException(
    ERROR_MESSAGES.MCP_OAUTH.INVALID_CIMD_CLIENT_ID,
  );
}

/**
 * Parse and validate a ChatGPT CIMD client_id URL; return a server-trusted fetch target.
 */
export function resolveTrustedCimdFetchTarget(
  clientId: string,
): TrustedCimdFetchTarget {
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
      return { host: "chatgpt.com", pathname: parsed.pathname };
    case "chat.openai.com":
      return { host: "chat.openai.com", pathname: parsed.pathname };
    default:
      return invalidCimdClientId();
  }
}

/**
 * Build a metadata fetch URL using only trusted host literals (SSRF guard).
 * Pathname was already validated in resolveTrustedCimdFetchTarget.
 */
export function buildTrustedCimdMetadataUrl(
  target: TrustedCimdFetchTarget,
): URL {
  const base =
    target.host === "chatgpt.com"
      ? "https://chatgpt.com"
      : "https://chat.openai.com";

  return new URL(target.pathname, base);
}
