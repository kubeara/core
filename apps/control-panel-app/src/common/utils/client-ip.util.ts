import type { Request } from "express";

/**
 * Derive the client IP from the HTTP request.
 * Prefers the first X-Forwarded-For hop; does not trust body-supplied values.
 */
export function resolveClientIp(request: Request): string {
  const forwarded = request.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    const firstHop = forwarded.split(",")[0]?.trim();
    if (firstHop) {
      return firstHop;
    }
  }

  if (Array.isArray(forwarded) && forwarded[0]) {
    const firstHop = forwarded[0].split(",")[0]?.trim();
    if (firstHop) {
      return firstHop;
    }
  }

  return request.ip || request.socket.remoteAddress || "unknown";
}
