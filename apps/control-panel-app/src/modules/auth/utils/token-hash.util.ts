import { createHash, timingSafeEqual } from "crypto";

/**
 * Hash a token
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verify a token hash
 */
export function verifyTokenHash(token: string, hash: string): boolean {
  const tokenHash = hashToken(token);

  try {
    return timingSafeEqual(
      Buffer.from(tokenHash, "hex"),
      Buffer.from(hash, "hex"),
    );
  } catch {
    return false;
  }
}
