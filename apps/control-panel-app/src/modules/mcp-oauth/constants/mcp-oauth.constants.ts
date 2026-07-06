export const MCP_OAUTH_SCOPES = {
  READ: "mcp:read",
  WRITE: "mcp:write",
} as const;

export const MCP_OAUTH_DEFAULT_SCOPES = [
  MCP_OAUTH_SCOPES.READ,
  MCP_OAUTH_SCOPES.WRITE,
] as const;

export const MCP_OAUTH_TOKEN_TYPE = "mcp_oauth" as const;

export const MCP_OAUTH_GRANT_TYPES = {
  AUTHORIZATION_CODE: "authorization_code",
  REFRESH_TOKEN: "refresh_token",
} as const;

export const MCP_OAUTH_CODE_CHALLENGE_METHOD = "S256" as const;

export const MCP_OAUTH_CHATGPT_REDIRECT_PREFIX =
  "https://chatgpt.com/connector/oauth/";

export const MCP_OAUTH_CHATGPT_CLIENT_ID_PREFIX = "https://chatgpt.com/";

export const MCP_OAUTH_CHATGPT_HOST = "chatgpt.com";

export const MCP_OAUTH_CIMD_ALLOWED_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
] as const;

export const MCP_OAUTH_CIMD_CACHE_TTL_SECONDS = 3600;
