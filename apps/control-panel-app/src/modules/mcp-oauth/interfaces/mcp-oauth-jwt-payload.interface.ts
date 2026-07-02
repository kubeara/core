import { MCP_OAUTH_TOKEN_TYPE } from "../constants/mcp-oauth.constants";

export interface McpOAuthJwtPayload {
  sub: string;
  iss: string;
  aud: string;
  scope: string;
  tokenType: typeof MCP_OAUTH_TOKEN_TYPE;
}
