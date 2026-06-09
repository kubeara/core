import { InternalServerErrorException } from "@nestjs/common";
import { Request } from "express";

const JWT_PARTS = 3;

export function isJwtToken(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === JWT_PARTS &&
    parts.every((part) => part.length > 0) &&
    value.startsWith("eyJ")
  );
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieHeader(cookieHeader: string): Map<string, string[]> {
  try {
    const grouped = new Map<string, string[]>();

    for (const segment of cookieHeader.split(";")) {
      const trimmed = segment.trim();
      if (!trimmed) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const name = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1);
      const value = decodeCookieValue(rawValue);

      const existing = grouped.get(name) ?? [];
      existing.push(value);
      grouped.set(name, existing);
    }

    return grouped;
  } catch (error) {
    throw new InternalServerErrorException("Failed to parse cookie header", {
      cause: error,
    });
  }
}

/**
 * Extract all cookie values from the request
 */
export function extractAllCookieValues(
  req: Request,
  cookieName: string,
): string[] {
  try {
    const values: string[] = [];
    const seen = new Set<string>();

    const cookieHeader = req.headers.cookie;
    if (typeof cookieHeader === "string" && cookieHeader.length > 0) {
      const grouped = parseCookieHeader(cookieHeader);
      for (const value of grouped.get(cookieName) ?? []) {
        if (!seen.has(value)) {
          seen.add(value);
          values.push(value);
        }
      }
    }

    const parsed = req.cookies as Record<string, unknown> | undefined;
    const parsedValue = parsed?.[cookieName];
    if (typeof parsedValue === "string" && !seen.has(parsedValue)) {
      values.push(parsedValue);
    }

    return values;
  } catch (error) {
    throw new InternalServerErrorException("Failed to extract cookie values", {
      cause: error,
    });
  }
}

/**
 * Extract a cookie token from the request
 */
export function extractCookieToken(
  req: Request,
  cookieName: string,
  options?: { requireJwt?: boolean },
): string | null {
  try {
    const values = extractAllCookieValues(req, cookieName);
    if (values.length === 0) {
      return null;
    }

    const jwtValues = values.filter(isJwtToken);
    const selected = jwtValues.at(-1) ?? values.at(-1) ?? null;

    if (!selected) {
      return null;
    }

    if (options?.requireJwt && !isJwtToken(selected)) {
      return null;
    }

    return selected;
  } catch (error) {
    throw new InternalServerErrorException("Failed to extract cookie token", {
      cause: error,
    });
  }
}
