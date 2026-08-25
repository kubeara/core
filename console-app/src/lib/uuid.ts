/**
 * RFC4122 v4 UUID that works in every browser context.
 * `crypto.randomUUID` only exists in secure contexts (HTTPS / localhost),
 * so plain-HTTP self-hosted deployments need the getRandomValues fallback.
 */
export function generateUuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    // Last resort for very old browsers without Web Crypto.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      (char) => {
        const rand = (Math.random() * 16) | 0;
        const value = char === "x" ? rand : (rand & 0x3) | 0x8;
        return value.toString(16);
      },
    );
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
