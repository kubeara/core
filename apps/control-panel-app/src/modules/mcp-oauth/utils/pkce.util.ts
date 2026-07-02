import { createHash } from "crypto";

import { MCP_OAUTH_CODE_CHALLENGE_METHOD } from "../constants/mcp-oauth.constants";

export function verifyPkceChallenge(
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: string,
): boolean {
  if (codeChallengeMethod !== MCP_OAUTH_CODE_CHALLENGE_METHOD) {
    return false;
  }

  const computed = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return computed === codeChallenge;
}
