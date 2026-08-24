import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import type { ConfigService } from "@nestjs/config";

import {
  isDevelopmentEnvironment,
  isLocalhostOrigin,
  isOriginAllowed,
  resolveCorsAllowedOrigins,
} from "./allowed-origins.util";

export function buildCorsOptions(configService: ConfigService): CorsOptions {
  const allowedOrigins = resolveCorsAllowedOrigins(
    configService.get<string>("CORS_ALLOWED_ORIGINS"),
    configService.get<string>("PUBLIC_API_ALLOWED_ORIGINS"),
  );

  const consolePort = configService.get<string>("SERVICE_PORT_KUBEARA_CONSOLE");

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

      if (isDevelopmentEnvironment() && isLocalhostOrigin(origin)) {
        callback(null, true);
        return;
      }

      if (consolePort) {
        try {
          const originUrl = new URL(origin);
          const originPort =
            originUrl.port || (originUrl.protocol === "https:" ? "443" : "80");
          const targetPort =
            consolePort || (originUrl.protocol === "https:" ? "443" : "80");
          if (originPort === targetPort) {
            callback(null, true);
            return;
          }
        } catch {
          // Fall through
        }
      }

      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "baggage",
      "sentry-trace",
    ],
  };
}
