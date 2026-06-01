/**
 * Normalizes a server host for URL generation (strips scheme/path).
 */
export function normalizeServerHostForUrls(host: string): string {
  try {
    const trimmed = host.trim();
    if (!trimmed) {
      return "127.0.0.1";
    }

    const withoutScheme = trimmed.replace(/^https?:\/\//i, "");
    const hostname = withoutScheme.split("/")[0]?.split(":")[0]?.trim();

    return hostname || "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}
