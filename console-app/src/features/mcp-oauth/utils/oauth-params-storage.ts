import type { McpOAuthAuthorizeParams } from "../api";

const STORAGE_KEY = "kubera_mcp_oauth_authorize_params";

export const MCP_OAUTH_AUTHORIZE_PATH = "/oauth/authorize";

export function persistMcpOAuthAuthorizeParams(
  params: McpOAuthAuthorizeParams,
): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(params));
}

export function readMcpOAuthAuthorizeParams(): McpOAuthAuthorizeParams | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as McpOAuthAuthorizeParams;
    if (
      !parsed.response_type ||
      !parsed.client_id ||
      !parsed.redirect_uri ||
      !parsed.state ||
      !parsed.code_challenge ||
      !parsed.code_challenge_method
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearMcpOAuthAuthorizeParams(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
