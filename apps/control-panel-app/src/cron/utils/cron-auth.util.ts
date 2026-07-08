import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const CRON_AUTH_TOKEN_HEADER = "cron-auth-token";

/**
 * Validates the cron-auth-token header against CRON_AUTH_TOKEN.
 * Throws UnauthorizedException when the token is missing or does not match.
 */
export function assertCronAuthToken(
  configService: ConfigService,
  cronAuthToken?: string,
): void {
  const expectedToken = configService.get<string>("CRON_AUTH_TOKEN");

  if (!expectedToken) {
    throw new UnauthorizedException("Cron auth is not configured");
  }

  if (!cronAuthToken || cronAuthToken !== expectedToken) {
    throw new UnauthorizedException("Invalid cron auth token");
  }
}
