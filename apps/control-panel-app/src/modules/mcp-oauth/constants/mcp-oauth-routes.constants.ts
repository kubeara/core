import { RequestMethod } from "@nestjs/common";

export const MCP_OAUTH_WELL_KNOWN_PATHS = {
  protectedResource: ".well-known/oauth-protected-resource/api/mcp",
  authorizationServer: ".well-known/oauth-authorization-server",
  authorizationServerWithResource:
    ".well-known/oauth-authorization-server/api/mcp",
  openIdConfiguration: ".well-known/openid-configuration",
  openIdConfigurationWithResource: ".well-known/openid-configuration/api/mcp",
} as const;

export const MCP_OAUTH_GLOBAL_PREFIX_EXCLUDES = [
  {
    path: MCP_OAUTH_WELL_KNOWN_PATHS.protectedResource,
    method: RequestMethod.GET,
  },
  {
    path: MCP_OAUTH_WELL_KNOWN_PATHS.authorizationServer,
    method: RequestMethod.GET,
  },
  {
    path: MCP_OAUTH_WELL_KNOWN_PATHS.authorizationServerWithResource,
    method: RequestMethod.GET,
  },
  {
    path: MCP_OAUTH_WELL_KNOWN_PATHS.openIdConfiguration,
    method: RequestMethod.GET,
  },
  {
    path: MCP_OAUTH_WELL_KNOWN_PATHS.openIdConfigurationWithResource,
    method: RequestMethod.GET,
  },
  { path: "oauth/authorize", method: RequestMethod.GET },
  { path: "oauth/token", method: RequestMethod.POST },
] as const;
