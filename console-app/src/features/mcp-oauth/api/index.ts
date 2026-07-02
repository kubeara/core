import { apiClient } from "@/api/axios";
import type { AuthApiResponse } from "@/features/auth/types";
import { readMcpOAuthAuthorizeParams } from "../utils/oauth-params-storage";

export type McpOAuthAuthorizeParams = {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  resource: string;
};

export async function approveMcpOAuthAuthorization(
  params: McpOAuthAuthorizeParams,
): Promise<string> {
  const response = await apiClient.post<
    AuthApiResponse<{ redirectUrl: string }>
  >("/oauth/authorize/approve", params);

  const redirectUrl = response.data.data?.redirectUrl;
  if (!redirectUrl) {
    throw new Error("No redirect URL in authorization response");
  }

  return redirectUrl;
}

export function parseMcpOAuthAuthorizeParams(
  searchParams: URLSearchParams,
): McpOAuthAuthorizeParams | null {
  const response_type = searchParams.get("response_type")?.trim() ?? "";
  const client_id = searchParams.get("client_id")?.trim() ?? "";
  const redirect_uri = searchParams.get("redirect_uri")?.trim() ?? "";
  const scope = searchParams.get("scope")?.trim() ?? "";
  const state = searchParams.get("state")?.trim() ?? "";
  const code_challenge = searchParams.get("code_challenge")?.trim() ?? "";
  const code_challenge_method =
    searchParams.get("code_challenge_method")?.trim() ?? "";
  const resource = searchParams.get("resource")?.trim() ?? "";

  if (
    !response_type ||
    !client_id ||
    !redirect_uri ||
    !state ||
    !code_challenge ||
    !code_challenge_method
  ) {
    return null;
  }

  return {
    response_type,
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
    resource,
  };
}

/** Read OAuth params from the URL, or from session storage after login redirect. */
export function resolveMcpOAuthAuthorizeParams(
  searchParams: URLSearchParams,
): McpOAuthAuthorizeParams | null {
  const fromUrl = parseMcpOAuthAuthorizeParams(searchParams);
  if (fromUrl) {
    return fromUrl;
  }

  return readMcpOAuthAuthorizeParams();
}

