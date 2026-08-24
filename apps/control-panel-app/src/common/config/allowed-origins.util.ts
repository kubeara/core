import type { Request } from "express";

const PRODUCTION_DEFAULT_ORIGINS = [
  "https://kubeara.dev",
  "https://www.kubeara.dev",
  "https://app.kubeara.dev",
  "https://kubeara.com",
  "https://www.kubeara.com",
] as const;

/** Sentinel enabling all origins (self-hosted default; override for strict CORS). */
export const CORS_WILDCARD = "*";

export function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function getDefaultAllowedOrigins(): string[] {
  if (isDevelopmentEnvironment()) {
    return [];
  }

  return [...PRODUCTION_DEFAULT_ORIGINS];
}

export function normalizeOrigin(origin: string): string {
  return new URL(origin.trim()).origin;
}

export function parseAllowedOrigins(raw: string): string[] {
  const origins = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const normalized: string[] = [];
  for (const origin of origins) {
    if (origin === CORS_WILDCARD) {
      normalized.push(CORS_WILDCARD);
      continue;
    }
    try {
      normalized.push(normalizeOrigin(origin));
    } catch {
      // Skip malformed entries instead of failing startup — a bad CORS
      // value must never prevent the service from booting.
      continue;
    }
  }

  return [...new Set(normalized)];
}

export function resolvePublicApiAllowedOrigins(
  configured: string | undefined,
): string[] {
  if (configured?.trim()) {
    return parseAllowedOrigins(configured);
  }
  return getDefaultAllowedOrigins();
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
  if (allowedOrigins.includes(CORS_WILDCARD)) {
    return true;
  }

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
