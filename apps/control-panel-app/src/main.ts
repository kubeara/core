import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";

import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";

const APP_NAME = "control-panel-app";

const REQUIRED_ENV_KEYS: string[] = [
  "PORT",
  "DB_HOST",
  "DB_PORT",
  "DB_USERNAME",
  "DB_PASSWORD",
  "DB_DATABASE",
  "ENCRYPTION_SECRET",
];

function getRootDirectory(): string {
  return process.cwd();
}

function getAppEnvPath(rootDir: string): string {
  return path.join(rootDir, "apps", APP_NAME, ".env");
}

function validateRootEnvIsolation(rootDir: string): void {
  const rootEnvPath = path.join(rootDir, ".env");

  const isMonorepo =
    fs.existsSync(path.join(rootDir, "apps")) &&
    fs.existsSync(path.join(rootDir, "package.json"));

  if (!isMonorepo) {
    return;
  }

  if (fs.existsSync(rootEnvPath)) {
    throw new Error(
      [
        "",
        "========================================================================",
        `[FATAL] Root .env file detected: ${rootEnvPath}`,
        "",
        "Root-level environment files are not allowed in this monorepo.",
        "Each application must use its own isolated environment file.",
        "",
        "Required locations:",
        "  - apps/control-panel-app/.env",
        "  - apps/agent-app/.env",
        "========================================================================",
        "",
      ].join("\n"),
    );
  }
}

function loadEnvironmentFile(envPath: string): void {
  const isDockerEnvironment =
    process.env.NODE_ENV === "production" || process.env.DOCKER_ENV === "true";

  if (!fs.existsSync(envPath)) {
    if (isDockerEnvironment) {
      return;
    }

    throw new Error(
      [
        "",
        "========================================================================",
        `[FATAL] Environment file not found: ${envPath}`,
        "",
        "Create the environment file before starting the application.",
        "",
        "Example:",
        `  cp apps/${APP_NAME}/.env.example apps/${APP_NAME}/.env`,
        "========================================================================",
        "",
      ].join("\n"),
    );
  }

  dotenv.config({
    path: envPath,
  });
}

function validateRequiredEnvironmentVariables(): void {
  const missingKeys = REQUIRED_ENV_KEYS.filter(
    (key: string) =>
      process.env[key] === undefined ||
      process.env[key] === null ||
      process.env[key]?.trim() === "",
  );

  if (missingKeys.length === 0) {
    return;
  }

  throw new Error(
    [
      "",
      "========================================================================",
      "[FATAL] Missing required environment variables",
      "",
      ...missingKeys.map((key: string) => `  - ${key}`),
      "",
      `Please update apps/${APP_NAME}/.env`,
      "========================================================================",
      "",
    ].join("\n"),
  );
}

function initializeEnvironment(): void {
  const rootDir = getRootDirectory();

  validateRootEnvIsolation(rootDir);

  const envPath = getAppEnvPath(rootDir);

  loadEnvironmentFile(envPath);

  validateRequiredEnvironmentVariables();
}

async function bootstrap(): Promise<void> {
  initializeEnvironment();

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port = Number(configService.get<string>("PORT"));

  app.setGlobalPrefix("api");

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(port);

  console.log(`[${APP_NAME}] Server running on port ${port}`);
}

void bootstrap();
