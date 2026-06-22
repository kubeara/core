import type { Request } from "express";

export function normalizeOrigin(origin: string): string {
  return new URL(origin.trim()).origin;
}

export function parseAllowedOrigins(raw: string): string[] {
  const origins = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  return [...new Set(origins)];
}

export function resolvePublicApiAllowedOrigins(
  configured: string | undefined,
): string[] {
  if (configured?.trim()) {
    return parseAllowedOrigins(configured);
  }
  return [];
}

export function resolveCorsAllowedOrigins(
  corsConfigured: string | undefined,
  publicConfigured: string | undefined,
): string[] {
  if (corsConfigured?.trim()) {
    return parseAllowedOrigins(corsConfigured);
  }

  return resolvePublicApiAllowedOrigins(publicConfigured);
}

export function isOriginAllowed(
  requestOrigin: string,
  allowedOrigins: readonly string[],
): boolean {
  try {
    const normalized = normalizeOrigin(requestOrigin);
    return allowedOrigins.some((allowed) => allowed === normalized);
  } catch {
    return false;
  }
}

function getRequestProtocol(request: Request): string {
  const forwarded = request.headers["x-forwarded-proto"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return request.protocol;
}

function extractOriginFromReferer(referer: string): string | null {
  try {
    return normalizeOrigin(new URL(referer).origin);
  } catch {
    return null;
  }
}

export function resolveRequestOrigin(request: Request): string | null {
  const originHeader = request.headers.origin;
  if (typeof originHeader === "string" && originHeader.trim()) {
    try {
      return normalizeOrigin(originHeader);
    } catch {
      return null;
    }
  }

  const refererHeader = request.headers.referer;
  if (typeof refererHeader === "string" && refererHeader.trim()) {
    return extractOriginFromReferer(refererHeader);
  }

  const host = request.headers.host;
  if (typeof host === "string" && host.trim()) {
    try {
      return normalizeOrigin(`${getRequestProtocol(request)}://${host}`);
    } catch {
      return null;
    }
  }

  return null;
}
