import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import {
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
      this.configService.get<string>("NODE_ENV"),
    );
    const requestOrigin = resolveRequestOrigin(request);

    if (!requestOrigin || !isOriginAllowed(requestOrigin, allowedOrigins)) {
      throw new ForbiddenException("Sorry, this endpoint is not available from your origin.");
    }

    return true;
  }
}
