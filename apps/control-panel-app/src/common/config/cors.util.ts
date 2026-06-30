import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import type { ConfigService } from "@nestjs/config";

import {
  isOriginAllowed,
  resolveCorsAllowedOrigins,
} from "./allowed-origins.util";

export function buildCorsOptions(configService: ConfigService): CorsOptions {
  let allowedOrigins = resolveCorsAllowedOrigins(
    configService.get<string>("CORS_ALLOWED_ORIGINS"),
    configService.get<string>("PUBLIC_API_ALLOWED_ORIGINS"),
  );

  if (
    allowedOrigins.length === 0 &&
    configService.get<string>("ENV") === "development"
  ) {
    allowedOrigins = [
      "http://localhost:4000",
      "http://localhost:4100",
      "http://localhost:3000",
      "http://localhost:5173",
    ];
  }

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  };
}
