/**
 * Seeds service templates directly from source files under apps/control-panel-app/templates.
 * Reads docker-compose.yml (and optional template.config.json), then upserts rows by slug.
 * Translatable marketing fields (category, tags, descriptions) are seeded into
 * serviceTemplateTranslations from each template's locale.json (one file per template,
 * containing en/de/fr/pt entries).
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
import { ServiceTemplateTranslationEntity } from "../src/modules/service-template/entities/service-template-translation.entity";
import { ServiceTemplateEntity } from "../src/modules/service-template/entities/service-template.entity";
import { EntityStatus } from "../src/common/entity/base.entity";

const ROOT_DIR = process.cwd();
const ROOT_ENV_PATH = path.join(ROOT_DIR, ".env");
const APP_ENV_PATH = path.join(ROOT_DIR, "apps/control-panel-app/.env");
import dayjs from "dayjs";
import { isDbSslEnabled } from "@control-panel/constants/env.constant";

/**
 * Translatable marketing fields for a single template locale.
 */
interface TemplateTranslation {
  category?: string[];
  tags?: string[];
  shortDescription?: string;
  longDescription?: string;
}

/**
 * All translations for a single template keyed by locale.
 */
type TemplateTranslationsByLocale = Record<string, TemplateTranslation>;

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
    const useSsl = isDbSslEnabled(configService.get<string>("DB_SSL"));
    return new DataSource({
      type: "postgres",
      host: configService.get<string>("DB_HOST") as string,
      port: Number(configService.get<string>("DB_PORT")),
      username: configService.get<string>("DB_USERNAME") as string,
      password: configService.get<string>("DB_PASSWORD") as string,
      database: configService.get<string>("DB_DATABASE") as string,
      synchronize: false,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      entities: [ServiceTemplateEntity, ServiceTemplateTranslationEntity],
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
 * Reads template translations from a template's locale.json file.
 * @param localePath Absolute path to <templatesDir>/<slug>/locale.json.
 * @returns Translations keyed by locale (en/de/fr/pt).
 */
function loadTemplateTranslations(
  localePath: string,
): TemplateTranslationsByLocale {
  try {
    if (!fs.existsSync(localePath)) {
      return {};
    }

    const rawContent = fs.readFileSync(localePath, "utf8");
    const parsed = JSON.parse(rawContent) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Template locale JSON must resolve to an object");
    }

    return parsed as TemplateTranslationsByLocale;
  } catch (error: unknown) {
    throw new Error(
      `Failed to load template translations from "${localePath}": ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Reads template sources from disk and upserts them into the database.
 * Uses slug as the conflict key so reruns update existing template rows.
 * Translatable fields are upserted into serviceTemplateTranslations keyed by
 * (serviceTemplateId, locale) from each template's locale.json.
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

    const templateRepository = dataSource.getRepository(ServiceTemplateEntity);
    const translationRepository = dataSource.getRepository(
      ServiceTemplateTranslationEntity,
    );

    for (const templateRecord of serviceTemplateRecords) {
      try {
        const payload = {
          slug: templateRecord.slug,
          name: templateRecord.name,
          documentation: templateRecord.documentation || null,
          logo: templateRecord.logo || null,
          compose: templateRecord.compose,
          envSchema: templateRecord.envSchema ?? null,
          portSchema: templateRecord.portSchema ?? null,
          port: templateRecord.port || null,
          version: templateRecord.version || null,
          isActive: templateRecord.isActive,
          status: EntityStatus.ACTIVE,
          createdAt: dayjs().unix(),
          updatedAt: dayjs().unix(),
        };

        await templateRepository.upsert(payload, ["slug"]);

        console.log(`Seeded template from source: ${templateRecord.slug}`);
      } catch (error: unknown) {
        throw new Error(
          `Failed to upsert template "${templateRecord.slug}": ${toErrorMessage(error)}`,
        );
      }
    }

    const templateRows = await templateRepository.find({
      select: { slug: true, id: true },
    });
    const serviceTemplateIdsBySlug = new Map(
      templateRows.map((template) => [template.slug, template.id]),
    );

    let seededTranslationCount = 0;

    for (const templateRecord of serviceTemplateRecords) {
      const serviceTemplateId = serviceTemplateIdsBySlug.get(
        templateRecord.slug,
      );

      if (!serviceTemplateId) {
        console.warn(
          `Skipping translations for unknown template slug: ${templateRecord.slug}`,
        );
        continue;
      }

      const translationsByLocale = loadTemplateTranslations(
        path.join(templatesDir, templateRecord.slug, "locale.json"),
      );

      for (const [locale, translation] of Object.entries(
        translationsByLocale,
      )) {
        try {
          await translationRepository.upsert(
            {
              serviceTemplateId,
              locale,
              category:
                translation.category && translation.category.length > 0
                  ? translation.category
                  : null,
              tags:
                translation.tags && translation.tags.length > 0
                  ? translation.tags
                  : null,
              shortDescription: translation.shortDescription?.trim() || null,
              longDescription: translation.longDescription?.trim() || null,
              status: EntityStatus.ACTIVE,
              createdAt: dayjs().unix(),
              updatedAt: dayjs().unix(),
            },
            ["serviceTemplateId", "locale"],
          );

          seededTranslationCount += 1;
        } catch (error: unknown) {
          throw new Error(
            `Failed to upsert translation for template "${templateRecord.slug}" (${locale}): ${toErrorMessage(error)}`,
          );
        }
      }
    }

    console.log(`Seeded ${seededTranslationCount} template translation(s)`);
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
