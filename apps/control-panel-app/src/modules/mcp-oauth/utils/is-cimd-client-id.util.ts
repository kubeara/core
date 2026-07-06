import { resolveTrustedCimdFetchTarget } from "./parse-cimd-client-id-url.util";

/**
 * Whether client_id is a ChatGPT Client ID Metadata Document URL (not the legacy static value).
 */
export function isCimdClientId(clientId: string): boolean {
  try {
    resolveTrustedCimdFetchTarget(clientId);
    return true;
  } catch {
    return false;
  }
}
