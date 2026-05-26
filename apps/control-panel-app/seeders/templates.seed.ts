/**
 * Seeds service templates directly from source files under apps/control-panel-app/templates.
 * Reads docker-compose.yml (and optional template.config.json), then upserts rows by slug.
 *
 * Run via: npm run seed (after build) or npm run seed:dev
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";

import {
  buildServiceTemplateRecords,
  getDefaultTemplatesDir,
} from "../src/templates/build-template-records.util";
import { ServiceTemplateEntity } from "../src/modules/templates/entities/service-template.entity";
import { EntityStatus } from "../src/common/entity/base.entity";

const ROOT_DIR = process.cwd();
const ROOT_ENV_PATH = path.join(ROOT_DIR, ".env");
const APP_ENV_PATH = path.join(ROOT_DIR, "apps/control-panel-app/.env");
import dayjs from "dayjs";

/**
 * Database connection settings required before seeding can start.
 */
const REQUIRED_ENV_KEYS = [
  "DB_HOST",
  "DB_PORT",
  "DB_USERNAME",
  "DB_PASSWORD",
  "DB_DATABASE",
] as const;

/**
 * Normalizes unknown thrown values into a readable error message.
 * @param error Value caught from a try/catch block.
 * @returns Human-readable error text.
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Builds a multi-line fatal error message with consistent formatting.
 * @param lines Error detail lines displayed between banner separators.
 * @returns Error instance ready to throw.
 */
function createFatalError(lines: string[]): Error {
  return new Error(
    [
      "",
      "========================================================================",
      ...lines,
      "========================================================================",
      "",
    ].join("\n"),
  );
}

/**
 * Ensures only app-scoped env files are used for seeding.
 * Rejects a repo-root .env and requires apps/control-panel-app/.env.
 */
function assertEnvFilePolicy(): void {
  try {
    if (fs.existsSync(ROOT_ENV_PATH)) {
      throw createFatalError([
        `[FATAL] Root .env file detected at: ${ROOT_ENV_PATH}`,
        "Root level env files are not allowed.",
        "Use only app specific env files:",
        "  - apps/control-panel-app/.env",
        "  - apps/agent-app/.env",
      ]);
    }

    if (!fs.existsSync(APP_ENV_PATH)) {
      throw createFatalError([
        `[FATAL] Missing env file: ${APP_ENV_PATH}`,
        "Please create the file before running the seed script.",
      ]);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `Failed to validate env file policy: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Loads control-panel env values and returns a ConfigService instance.
 * @returns ConfigService backed by apps/control-panel-app/.env.
 */
function createConfigService(): ConfigService {
  try {
    assertEnvFilePolicy();
    dotenv.config({ path: APP_ENV_PATH });
    return new ConfigService();
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `Failed to initialize configuration: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Validates required database env keys and DB_PORT format.
 * @param configService Loaded configuration service for the control panel app.
 */
function validateRequiredConfig(configService: ConfigService): void {
  try {
    const missingEnvKeys = REQUIRED_ENV_KEYS.filter(
      (key) => !configService.get<string>(key),
    );

    if (missingEnvKeys.length > 0) {
      throw createFatalError([
        "[FATAL] Missing required environment variables:",
        ...missingEnvKeys.map((key) => `  - ${key}`),
      ]);
    }

    const dbPort = Number(configService.get<string>("DB_PORT"));

    if (!Number.isFinite(dbPort) || dbPort <= 0) {
      throw createFatalError([
        "[FATAL] DB_PORT must be a positive number.",
        `  Received: ${configService.get<string>("DB_PORT")}`,
      ]);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `Failed to validate configuration: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Builds a TypeORM DataSource from validated config values.
 * @param configService Loaded configuration service for the control panel app.
 * @returns Uninitialized TypeORM data source for service templates.
 */
function createDataSource(configService: ConfigService): DataSource {
  try {
    return new DataSource({
      type: "postgres",
      host: configService.get<string>("DB_HOST") as string,
      port: Number(configService.get<string>("DB_PORT")),
      username: configService.get<string>("DB_USERNAME") as string,
      password: configService.get<string>("DB_PASSWORD") as string,
      database: configService.get<string>("DB_DATABASE") as string,
      synchronize: false,
      entities: [ServiceTemplateEntity],
    });
  } catch (error: unknown) {
    throw new Error(
      `Failed to create database connection: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Initializes the database connection and wraps connection errors with context.
 * @param dataSource TypeORM data source to connect.
 */
async function initializeDataSource(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.initialize();
  } catch (error: unknown) {
    throw new Error(`Failed to connect to database: ${toErrorMessage(error)}`);
  }
}

/**
 * Safely closes the database connection when seeding finishes or fails.
 * Logs cleanup failures without masking the original seed error.
 * @param dataSource TypeORM data source to disconnect.
 */
async function destroyDataSource(dataSource: DataSource): Promise<void> {
  if (!dataSource.isInitialized) {
    return;
  }

  try {
    await dataSource.destroy();
  } catch (error: unknown) {
    console.error(
      `Failed to close database connection: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Reads template sources from disk and upserts them into the database.
 * Uses slug as the conflict key so reruns update existing template rows.
 * @param configService Loaded configuration service for the control panel app.
 */
async function seedFromTemplates(configService: ConfigService): Promise<void> {
  const templatesDir = getDefaultTemplatesDir(ROOT_DIR);
  let dataSource: DataSource | undefined;

  try {
    let serviceTemplateRecords;

    try {
      serviceTemplateRecords = buildServiceTemplateRecords(templatesDir);
    } catch (error: unknown) {
      throw new Error(
        `Failed to build template records from "${templatesDir}": ${toErrorMessage(error)}`,
      );
    }

    if (serviceTemplateRecords.length === 0) {
      throw new Error(`No templates found in ${templatesDir}`);
    }

    console.log(
      `Building ${serviceTemplateRecords.length} template record(s) from ${templatesDir}`,
    );

    dataSource = createDataSource(configService);
    await initializeDataSource(dataSource);

    const repository = dataSource.getRepository(ServiceTemplateEntity);

    for (const templateRecord of serviceTemplateRecords) {
      try {
        const payload = {
          slug: templateRecord.slug,
          name: templateRecord.name,
          description: templateRecord.description || null,
          category: templateRecord.category || null,
          tags: templateRecord.tags.length > 0 ? templateRecord.tags : null,
          documentation: templateRecord.documentation || null,
          logo: templateRecord.logo || null,
          compose: templateRecord.compose,
          env_schema: templateRecord.env_schema ?? null,
          port_schema: templateRecord.port_schema ?? null,
          port: templateRecord.port || null,
          version: templateRecord.version || null,
          is_active: templateRecord.is_active,
          status: EntityStatus.ACTIVE,
          createdAt: dayjs().unix(),
          updatedAt: dayjs().unix(),
        };

        await repository.upsert(payload, ["slug"]);

        console.log(`Seeded template from source: ${templateRecord.slug}`);
      } catch (error: unknown) {
        throw new Error(
          `Failed to upsert template "${templateRecord.slug}": ${toErrorMessage(error)}`,
        );
      }
    }

    console.log("Template seeding from source completed successfully");
  } finally {
    if (dataSource) {
      await destroyDataSource(dataSource);
    }
  }
}

/**
 * Entry point for the template seed CLI script.
 * Loads config, validates env, seeds templates, and exits non-zero on failure.
 */
export async function seedTemplates(): Promise<void> {
  try {
    const configService = createConfigService();
    validateRequiredConfig(configService);
    await seedFromTemplates(configService);
  } catch (error: unknown) {
    console.error("\n[seed:templates] Failed.");
    console.error(toErrorMessage(error));

    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }

    process.exit(1);
  }
}
