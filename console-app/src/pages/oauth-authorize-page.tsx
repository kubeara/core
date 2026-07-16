import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AuthCard } from "@/features/auth/components/auth-card";
import { getErrorMessage } from "@/api/api-error";
import {
  approveMcpOAuthAuthorization,
  resolveMcpOAuthAuthorizeParams,
} from "@/features/mcp-oauth/api";
import {
  clearMcpOAuthAuthorizeParams,
  MCP_OAUTH_AUTHORIZE_PATH,
  persistMcpOAuthAuthorizeParams,
} from "@/features/mcp-oauth/utils/oauth-params-storage";

/**
 * ChatGPT MCP OAuth consent page.
 *
 * Users land here after the control panel redirects from GET /oauth/authorize.
 * If not signed in, McpOAuthAuthorizeRoute sends them to /login first.
 */
export function OAuthAuthorizePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const params = useMemo(
    () => resolveMcpOAuthAuthorizeParams(searchParams),
    [searchParams],
  );

  useEffect(() => {
    if (!params) {
      return;
    }

    persistMcpOAuthAuthorizeParams(params);

    if (searchParams.toString()) {
      navigate(MCP_OAUTH_AUTHORIZE_PATH, { replace: true });
    }
  }, [navigate, params, searchParams]);

  if (!params) {
    return <Navigate to="/login" replace />;
  }

  const scopes = params.scope
    .split(/\s+/)
    .filter(Boolean)
    .join(", ");

  async function handleAuthorize() {
    setError(null);
    setIsSubmitting(true);

    try {
      if (!params) {
        throw new Error("No authorization parameters found");
      }
      const redirectUrl = await approveMcpOAuthAuthorization(params);
      clearMcpOAuthAuthorizeParams();
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(getErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Connect ChatGPT to Kubeara"
      subtitle="Click Authorize below to finish connecting. You will be sent back to ChatGPT automatically."
    >
      <div className="auth-form">
        {scopes ? <p>Requested access: {scopes}</p> : null}

        {error ? <p className="form-message error">{error}</p> : null}

        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleAuthorize()}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Authorizing…" : "Authorize"}
        </button>
      </div>
    </AuthCard>
  );
}
