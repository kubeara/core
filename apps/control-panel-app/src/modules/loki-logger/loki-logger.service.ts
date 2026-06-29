import {
  Injectable,
  LoggerService,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as winston from "winston";

import {
  LOKI_LOGGER_SERVICE_NAME,
  LOKI_SHIPPING_ENV,
} from "./loki-logger.constants";
import {
  createWinstonLogger,
  resolveLokiLoggerConfig,
} from "./loki-logger.util";

type WinstonLogLevel = "info" | "error" | "warn" | "debug" | "verbose";

@Injectable()
export class LokiLoggerService implements LoggerService, OnModuleInit, OnModuleDestroy {
  private readonly winston: winston.Logger;
  private readonly lokiEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const config = resolveLokiLoggerConfig(configService);

    try {
      const result = createWinstonLogger(configService);
      this.winston = result.logger;
      this.lokiEnabled = result.lokiActive;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[${LOKI_LOGGER_SERVICE_NAME}] Failed to create logger, using console fallback: ${message}`,
      );
      this.winston = winston.createLogger({
        level: config.logLevel,
        transports: [
          new winston.transports.Console({
            level: config.logLevel,
          }),
        ],
      });
      this.lokiEnabled = false;
    }
  }

  onModuleInit(): void {
    if (this.lokiEnabled) {
      this.log("Grafana Cloud Loki logging enabled", LOKI_LOGGER_SERVICE_NAME);
      return;
    }

    this.log(
      `Grafana Cloud Loki logging disabled (requires KUBEARA_ENV=${LOKI_SHIPPING_ENV} and Grafana Cloud credentials)`,
      LOKI_LOGGER_SERVICE_NAME,
    );
  }

  onModuleDestroy(): void {
    for (const transport of this.winston.transports) {
      try {
        transport.close?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[${LOKI_LOGGER_SERVICE_NAME}] Failed to close log transport: ${message}`,
        );
      }
    }
  }

  log(message: unknown, context?: string): void {
    this.write("info", message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    const formatted = this.formatMessage(message);
    const payload = trace ? `${formatted}\n${trace}` : formatted;
    this.write("error", payload, context);
  }

  warn(message: unknown, context?: string): void {
    this.write("warn", message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write("verbose", message, context);
  }

  private write(
    level: WinstonLogLevel,
    message: unknown,
    context?: string,
  ): void {
    const formatted = this.formatMessage(message);
    const meta = context ? { context } : undefined;

    try {
      this.winston[level](formatted, meta);
    } catch (error) {
      this.fallbackConsole(level, formatted, error);
    }
  }

  private fallbackConsole(
    level: WinstonLogLevel,
    message: string,
    error: unknown,
  ): void {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(
      `[${LOKI_LOGGER_SERVICE_NAME}] Logger write failed (${level}): ${errMsg}`,
    );

    switch (level) {
      case "error":
        console.error(message);
        break;
      case "warn":
        console.warn(message);
        break;
      default:
        console.log(message);
        break;
    }
  }

  private formatMessage(message: unknown): string {
    if (typeof message === "string") {
      return message;
    }

    if (message instanceof Error) {
      return message.stack || message.message;
    }

    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
