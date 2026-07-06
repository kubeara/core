import { MCP_OAUTH_CHATGPT_HOST } from "../constants/mcp-oauth.constants";

/**
 * Whether client_id is a ChatGPT Client ID Metadata Document URL (not the legacy static value).
 */
export function isCimdClientId(clientId: string): boolean {
  try {
    const url = new URL(clientId);

    return (
      url.protocol === "https:" &&
      url.hostname === MCP_OAUTH_CHATGPT_HOST &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
}
