import type { McpOAuthAuthorizeParams } from "../api";

export const MCP_OAUTH_AUTHORIZE_PATH = "/oauth/authorize";

/**
 * In-memory store for OAuth authorization *request* params while the user
 * signs in. SPA client-side navigation preserves this across /login without
 * writing request metadata to sessionStorage.
 */
let cachedAuthorizeParams: McpOAuthAuthorizeParams | null = null;

function isValidMcpOAuthAuthorizeParams(
  params: McpOAuthAuthorizeParams,
): boolean {
  return !!(
    params.response_type &&
    params.client_id &&
    params.redirect_uri &&
    params.state &&
    params.code_challenge &&
    params.code_challenge_method
  );
}

export function persistMcpOAuthAuthorizeParams(
  params: McpOAuthAuthorizeParams,
): void {
  cachedAuthorizeParams = params;
}

export function readMcpOAuthAuthorizeParams(): McpOAuthAuthorizeParams | null {
  if (!cachedAuthorizeParams || !isValidMcpOAuthAuthorizeParams(cachedAuthorizeParams)) {
    return null;
  }

  return cachedAuthorizeParams;
}

export function clearMcpOAuthAuthorizeParams(): void {
  cachedAuthorizeParams = null;
}
