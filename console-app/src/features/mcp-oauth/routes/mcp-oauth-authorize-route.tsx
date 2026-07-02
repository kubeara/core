import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AppLoadingSkeleton } from "@/components/shared/skeleton";
import { useAuth } from "@/features/auth/context/use-auth";
import { parseMcpOAuthAuthorizeParams } from "@/features/mcp-oauth/api";
import {
  MCP_OAUTH_AUTHORIZE_PATH,
  persistMcpOAuthAuthorizeParams,
} from "@/features/mcp-oauth/utils/oauth-params-storage";

/**
 * Allows both guests (redirect to login) and authenticated users
 * for the MCP OAuth consent flow.
 */
export function McpOAuthAuthorizeRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AppLoadingSkeleton />;
  }

  if (!user) {
    const params = parseMcpOAuthAuthorizeParams(
      new URLSearchParams(location.search),
    );
    if (params) {
      persistMcpOAuthAuthorizeParams(params);
    }

    const from = encodeURIComponent(MCP_OAUTH_AUTHORIZE_PATH);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  return <Outlet />;
}
