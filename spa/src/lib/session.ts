import type { User } from "./types";
import { getUserByEmail, toPublicUser } from "./auth-store";
import { createSessionToken, verifySessionToken } from "./session-token";

export const COOKIE_NAME = "kubeara_session";

const isProduction = process.env.NODE_ENV === "production";

function sessionCookieValue(token: string): string {
  const secure = isProduction ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${secure}`;
}

const clearCookieValue = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;

export function getTokenFromCookieHeader(
  cookieHeader: string | null,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${COOKIE_NAME}=`)) {
      return trimmed.slice(COOKIE_NAME.length + 1);
    }
  }
  return undefined;
}

export async function setSessionOnResponse(
  response: Response,
  email: string,
): Promise<Response> {
  const token = await createSessionToken(email);
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", sessionCookieValue(token));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function clearSessionOnResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", clearCookieValue);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function getSessionUserFromRequest(
  request: Request,
): Promise<User | null> {
  const token = getTokenFromCookieHeader(request.headers.get("cookie"));
  if (!token) return null;
  const email = await verifySessionToken(token);
  if (!email) return null;
  const user = getUserByEmail(email);
  return user ? toPublicUser(user) : null;
}
