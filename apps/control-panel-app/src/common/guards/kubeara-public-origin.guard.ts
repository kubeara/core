import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import {
  isDevelopmentEnvironment,
  isLocalhostOrigin,
  isOriginAllowed,
  resolvePublicApiAllowedOrigins,
  resolveRequestOrigin,
} from "../config/allowed-origins.util";

@Injectable()
export class KubearaPublicOriginGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.method === "OPTIONS") {
      return true;
    }

    const allowedOrigins = resolvePublicApiAllowedOrigins(
      this.configService.get<string>("PUBLIC_API_ALLOWED_ORIGINS"),
    );
    const requestOrigin = resolveRequestOrigin(request);

    if (!requestOrigin) {
      throw new ForbiddenException(
        "Sorry, this endpoint is not available from your origin.",
      );
    }

    if (
      isOriginAllowed(requestOrigin, allowedOrigins) ||
      (isDevelopmentEnvironment() && isLocalhostOrigin(requestOrigin))
    ) {
      return true;
    }

    throw new ForbiddenException(
      "Sorry, this endpoint is not available from your origin.",
    );
  }
}
