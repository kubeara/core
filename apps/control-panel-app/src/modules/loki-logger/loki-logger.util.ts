import { ConfigService } from "@nestjs/config";
import * as winston from "winston";
import LokiTransport from "winston-loki";

import {
  LOKI_ENV_KEYS,
  LOKI_LOGGER_SERVICE_NAME,
  LOKI_SHIPPING_ENV,
} from "./loki-logger.constants";

export interface LokiLoggerConfig {
  enabled: boolean;
  logLevel: string;
}

export function isLokiShippingEnv(kubearaEnv: string | undefined): boolean {
  return kubearaEnv?.trim().toUpperCase() === LOKI_SHIPPING_ENV;
}

export function resolveLokiLoggerConfig(
  configService: ConfigService,
): LokiLoggerConfig {
  const pushUrl = configService.get<string>(LOKI_ENV_KEYS.PUSH_URL)?.trim();
  const user = configService.get<string>(LOKI_ENV_KEYS.USER)?.trim();
  const apiKey = configService.get<string>(LOKI_ENV_KEYS.API_KEY)?.trim();
  const kubearaEnv = configService.get<string>(LOKI_ENV_KEYS.ENV_LABEL)?.trim();

  const hasCredentials = Boolean(pushUrl && user && apiKey);

  return {
    enabled: hasCredentials && isLokiShippingEnv(kubearaEnv),
    logLevel:
      configService.get<string>(LOKI_ENV_KEYS.LOG_LEVEL)?.trim() || "info",
  };
}

function buildLokiLabels(configService: ConfigService): Record<string, string> {
  const envLabel =
    configService.get<string>(LOKI_ENV_KEYS.ENV_LABEL)?.trim() ||
    LOKI_SHIPPING_ENV;
  const hostLabel =
    configService.get<string>(LOKI_ENV_KEYS.HOST_LABEL)?.trim() ||
    LOKI_LOGGER_SERVICE_NAME;

  return {
    service: LOKI_LOGGER_SERVICE_NAME,
    env: envLabel,
    host: hostLabel,
  };
}

function parseLokiHost(pushUrl: string): string | null {
  try {
    const url = new URL(pushUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function createLokiTransport(
  configService: ConfigService,
  logLevel: string,
): winston.transport | null {
  const pushUrl = configService.get<string>(LOKI_ENV_KEYS.PUSH_URL)?.trim();
  const user = configService.get<string>(LOKI_ENV_KEYS.USER)?.trim();
  const apiKey = configService.get<string>(LOKI_ENV_KEYS.API_KEY)?.trim();

  if (!pushUrl || !user || !apiKey) {
    return null;
  }

  const host = parseLokiHost(pushUrl);
  if (!host) {
    console.error(
      `[${LOKI_LOGGER_SERVICE_NAME}] Invalid GRAFANA_CLOUD_LOKI_URL; Loki transport skipped`,
    );
    return null;
  }

  try {
    const basicAuth = Buffer.from(`${user}:${apiKey}`).toString("base64");

    return new LokiTransport({
      host,
      labels: buildLokiLabels(configService),
      json: true,
      level: logLevel,
      format: winston.format.json(),
      replaceTimestamp: true,
      batching: true,
      interval: 5,
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
      onConnectionError: (error: Error) => {
        console.error(
          `[${LOKI_LOGGER_SERVICE_NAME}] Loki connection error: ${error.message}`,
        );
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[${LOKI_LOGGER_SERVICE_NAME}] Failed to initialize Loki transport: ${message}`,
    );
    return null;
  }
}

function createConsoleTransport(logLevel: string): winston.transport {
  return new winston.transports.Console({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, context }) => {
        const ctx = typeof context === "string" ? context : "";
        const prefix = ctx ? `[${ctx}] ` : "";
        return `${String(timestamp)} ${String(level)} ${prefix}${String(message)}`;
      }),
    ),
  });
}

export interface CreateWinstonLoggerResult {
  logger: winston.Logger;
  lokiActive: boolean;
}

export function createWinstonLogger(
  configService: ConfigService,
): CreateWinstonLoggerResult {
  const { enabled, logLevel } = resolveLokiLoggerConfig(configService);

  const transports: winston.transport[] = [createConsoleTransport(logLevel)];

  let lokiActive = false;
  if (enabled) {
    const lokiTransport = createLokiTransport(configService, logLevel);
    if (lokiTransport) {
      transports.push(lokiTransport);
      lokiActive = true;
    }
  }

  return {
    logger: winston.createLogger({
      level: logLevel,
      transports,
    }),
    lokiActive,
  };
}
