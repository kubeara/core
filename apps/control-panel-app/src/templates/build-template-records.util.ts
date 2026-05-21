/**
 * Builds service template records from on-disk template sources.
 *
 * Supports two layouts:
 * - Directory templates: `<slug>/docker-compose.yml` with optional `template.config.json`
 * - Legacy flat files: `<slug>.yml` when no matching `<slug>/` directory exists
 *
 * Compose YAML is parsed to JSON, stripped of the top-level `version` field,
 * then stored as base64 in the `compose` column expected by the database.
 */
import * as fs from "fs";
import * as path from "path";

import * as yaml from "js-yaml";

/**
 * Display metadata for known templates keyed by slug.
 */
export interface TemplateMetadata {
  name: string;
  description: string;
  category: string;
  tags: string[];
  documentation: string;
  logo: string;
  port: number;
  version: string;
}

/**
 * Database-ready template payload produced from source files on disk.
 */
export interface ServiceTemplateRecord {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  documentation: string;
  logo: string;
  compose: string;
  port: number;
  version: string;
  is_active: boolean;
  env_schema?: unknown;
  port_schema?: unknown;
}

/**
 * Static metadata overrides for templates that need richer catalog details
 * than the slug-derived defaults provide.
 */
const metadataBySlug: Record<string, TemplateMetadata> = {
  postgresql: {
    name: "PostgreSQL",
    description: "World's most advanced database",
    category: "database",
    tags: ["database", "sql", "relational"],
    documentation: "https://www.postgresql.org",
    logo: "svgs/postgresql.svg",
    port: 5432,
    version: "16",
  },
  postgresV2: {
    name: "PostgreSQL V2",
    description:
      "PostgreSQL with compose-parser magic vars and DB-backed deployment env (without template.config.json)",
    category: "database",
    tags: ["database", "sql", "relational", "v2"],
    documentation: "https://www.postgresql.org",
    logo: "svgs/postgresql.svg",
    port: 5432,
    version: "16",
  },
  redis: {
    name: "Redis",
    description: "In-memory data structure store",
    category: "cache",
    tags: ["cache", "redis", "key-value"],
    documentation: "https://redis.io/docs",
    logo: "svgs/redis.svg",
    port: 6379,
    version: "7",
  },
  n8n: {
    name: "n8n",
    description: "Workflow automation tool",
    category: "automation",
    tags: ["n8n", "workflow", "automation", "no-code"],
    documentation: "https://n8n.io",
    logo: "svgs/n8n.png",
    port: 5678,
    version: "2.10.2",
  },
};

/**
 * Normalizes unknown thrown values into a readable error message.
 * @param error Value caught from a try/catch block.
 * @returns Human-readable error text.
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Builds fallback metadata when a template slug has no entry in metadataBySlug.
 * @param slug Template directory or file stem used as the canonical identifier.
 * @returns Minimal metadata derived from the slug.
 */
function defaultMetadata(slug: string): TemplateMetadata {
  return {
    name: slug
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    description: "",
    category: "",
    tags: [],
    documentation: "",
    logo: "",
    port: 0,
    version: "",
  };
}

/**
 * Serializes parsed compose JSON into the base64 format stored in the database.
 * @param composeJson Parsed docker-compose object.
 * @returns Base64-encoded JSON string.
 */
function encodeComposeToBase64(composeJson: Record<string, unknown>): string {
  try {
    return Buffer.from(JSON.stringify(composeJson)).toString("base64");
  } catch (error: unknown) {
    throw new Error(
      `Failed to encode compose payload: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Parses docker-compose YAML for a template slug.
 * @param yamlContent Raw docker-compose.yml contents.
 * @param slug Template identifier used in error messages.
 * @param sourcePath Absolute path to the compose file being parsed.
 * @returns Parsed compose object.
 */
function parseComposeYaml(
  yamlContent: string,
  slug: string,
  sourcePath: string,
): Record<string, unknown> {
  try {
    const parsed = yaml.load(yamlContent);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Compose YAML must resolve to an object");
    }

    return parsed as Record<string, unknown>;
  } catch (error: unknown) {
    throw new Error(
      `Failed to parse docker-compose.yml for template "${slug}" at ${sourcePath}: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Parses optional template.config.json for a template slug.
 * @param configPath Absolute path to template.config.json.
 * @param slug Template identifier used in error messages.
 * @returns Parsed config object.
 */
function parseTemplateConfig(
  configPath: string,
  slug: string,
): Record<string, unknown> {
  try {
    const configContent = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(configContent) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("template.config.json must resolve to an object");
    }

    return parsed as Record<string, unknown>;
  } catch (error: unknown) {
    throw new Error(
      `Failed to parse template.config.json for template "${slug}" at ${configPath}: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Reads template folders/files from disk and builds DB-ready service template records.
 * Compose YAML is parsed to JSON and stored as base64 in `compose`.
 * @param templatesDir Absolute path to apps/control-panel-app/templates.
 * @returns One record per discovered template source.
 */
export function buildServiceTemplateRecords(
  templatesDir: string,
): ServiceTemplateRecord[] {
  try {
    if (!fs.existsSync(templatesDir)) {
      throw new Error(`Templates directory not found: ${templatesDir}`);
    }

    const records: ServiceTemplateRecord[] = [];
    const files = fs.readdirSync(templatesDir);

    for (const file of files) {
      const filePath = path.join(templatesDir, file);
      const stat = fs.statSync(filePath);

      let slug = file;
      let jsonData: Record<string, unknown> | undefined;
      let configData: Record<string, unknown> | undefined;

      if (stat.isDirectory()) {
        /*
         * Directory layout: <templates>/<slug>/docker-compose.yml
         * Optional schema overrides live in template.config.json beside compose.
         */
        slug = file;
        const dockerComposePath = path.join(filePath, "docker-compose.yml");

        if (!fs.existsSync(dockerComposePath)) {
          continue;
        }

        try {
          const yamlContent = fs.readFileSync(dockerComposePath, "utf8");
          jsonData = parseComposeYaml(yamlContent, slug, dockerComposePath);
        } catch (error: unknown) {
          throw new Error(
            `Failed to read template "${slug}": ${toErrorMessage(error)}`,
          );
        }

        const configPath = path.join(filePath, "template.config.json");

        if (fs.existsSync(configPath)) {
          configData = parseTemplateConfig(configPath, slug);
        }
      } else {
        /*
         * Legacy flat layout: <templates>/<slug>.yml
         * Skip when a directory template with the same slug already exists.
         */
        if (!file.endsWith(".yml")) {
          continue;
        }

        slug = file.replace(".yml", "");

        const potentialDir = path.join(templatesDir, slug);

        if (
          fs.existsSync(potentialDir) &&
          fs.statSync(potentialDir).isDirectory()
        ) {
          continue;
        }

        try {
          const yamlContent = fs.readFileSync(filePath, "utf8");
          jsonData = parseComposeYaml(yamlContent, slug, filePath);
        } catch (error: unknown) {
          throw new Error(
            `Failed to read template "${slug}": ${toErrorMessage(error)}`,
          );
        }
      }

      if (!jsonData) {
        continue;
      }

      /*
       * Compose version is removed before persistence because downstream
       * deployment logic expects parser-normalized compose without it.
       */
      delete jsonData.version;

      const metadata = metadataBySlug[slug] ?? defaultMetadata(slug);
      const composeBase64 = encodeComposeToBase64(jsonData);

      const record: ServiceTemplateRecord = {
        slug,
        name: metadata.name,
        description: metadata.description,
        category: metadata.category,
        tags: metadata.tags,
        documentation: metadata.documentation,
        logo: metadata.logo,
        compose: composeBase64,
        port: metadata.port,
        version: metadata.version,
        is_active: true,
      };

      if (configData?.env_schema) {
        record.env_schema = configData.env_schema;
      }

      if (configData?.port_schema) {
        record.port_schema = configData.port_schema;
      }

      records.push(record);
    }

    return records;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      `Failed to build service template records: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Resolves the default templates directory for the monorepo root.
 * @param rootDir Repository root directory. Defaults to process.cwd().
 * @returns Absolute path to apps/control-panel-app/templates.
 */
export function getDefaultTemplatesDir(
  rootDir: string = process.cwd(),
): string {
  return path.join(rootDir, "apps/control-panel-app/templates");
}
