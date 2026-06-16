import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import type { ConfigService } from "@nestjs/config";

import {
  isOriginAllowed,
  resolveCorsAllowedOrigins,
} from "./allowed-origins.util";

export function buildCorsOptions(configService: ConfigService): CorsOptions {
  const allowedOrigins = resolveCorsAllowedOrigins(
    configService.get<string>("CORS_ALLOWED_ORIGINS"),
    configService.get<string>("PUBLIC_API_ALLOWED_ORIGINS"),
    configService.get<string>("NODE_ENV"),
  );

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
