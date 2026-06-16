import type { Request } from "express";

import { isProductionEnv } from "@control-panel/constants/env.constant";

const DEV_DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

const KUBEARA_DEFAULT_ORIGINS = [
  "https://kubeara.dev",
  "https://www.kubeara.dev",
  "https://app.kubeara.dev",
  "https://kubeara.com",
  "https://www.kubeara.com",
] as const;

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
  nodeEnv: string | undefined,
): string[] {
  if (configured?.trim()) {
    return parseAllowedOrigins(configured);
  }

  if (isProductionEnv(nodeEnv)) {
    return [...KUBEARA_DEFAULT_ORIGINS];
  }

  return [...DEV_DEFAULT_ORIGINS];
}

export function resolveCorsAllowedOrigins(
  corsConfigured: string | undefined,
  publicConfigured: string | undefined,
  nodeEnv: string | undefined,
): string[] {
  if (corsConfigured?.trim()) {
    return parseAllowedOrigins(corsConfigured);
  }

  return resolvePublicApiAllowedOrigins(publicConfigured, nodeEnv);
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
