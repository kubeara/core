const DETECT_TIMEOUT_MS = 5000;
const DETECT_URL = "https://api.ipify.org?format=text";

/**
 * Detects the outbound public IPv4 address for matching control-panel `servers.host`.
 * Returns empty string when detection fails (control panel may still bind local server).
 */
export async function detectOutboundPublicIp(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);

    const response = await fetch(DETECT_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return "";
    }

    const text = (await response.text()).trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
      return "";
    }

    return text;
  } catch {
    return "";
  }
}

/**
 * Local fallback when no public IP is configured or detected.
 */
export function localLoopbackHost(): string {
  return "127.0.0.1";
}
