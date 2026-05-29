import { ServerErrorCode } from "../enums/server-error-code.enum";

export function mapSshTestErrorCode(
  message: string | undefined,
): ServerErrorCode {
  const msg = (message ?? "").toLowerCase();

  if (
    msg.includes("permission denied") ||
    msg.includes("authentication failed") ||
    msg.includes("auth")
  ) {
    return ServerErrorCode.AUTH_FAILED;
  }

  if (msg.includes("timed out") || msg.includes("timeout")) {
    return ServerErrorCode.CONNECTION_TIMEOUT;
  }

  if (
    msg.includes("getaddrinfo") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("host") ||
    msg.includes("unreachable")
  ) {
    return ServerErrorCode.HOST_UNREACHABLE;
  }

  return ServerErrorCode.UNKNOWN_ERROR;
}
