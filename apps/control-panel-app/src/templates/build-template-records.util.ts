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
import {
  encodeLogoReferenceToDataUri,
  getTemplateDescriptionFromComments,
  getTemplateLongDescriptionFromComments,
  parseTemplateCommentMetadata,
} from "@shared/common";
import * as fs from "fs";
import * as path from "path";

import * as yaml from "js-yaml";

/**
 * Display metadata for known templates keyed by slug.
 */
export interface TemplateMetadata {
  name: string;
  shortDescription: string;
  longDescription: string;
  category: string[];
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
  shortDescription: string;
  longDescription: string;
  category: string[];
  tags: string[];
  documentation: string;
  logo: string;
  compose: string;
  port: number;
  version: string;
  isActive: boolean;
  envSchema?: unknown;
  portSchema?: unknown;
}

/**
 * Optional per-slug overrides for fields not present in compose comment headers
 * (e.g. display name, logo, image version). Compose comments are the primary
 * source for documentation, short/long descriptions, category, tags, logo path, and port.
 */
const metadataBySlug: Partial<Record<string, Partial<TemplateMetadata>>> = {
  postgresql: {
    name: "PostgreSQL",
    version: "16",
  },
  postgresV2: {
    name: "PostgreSQL V2",
    version: "16",
  },
  redis: {
    name: "Redis",
    version: "7",
  },
  n8n: {
    name: "n8n",
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
    shortDescription: "",
    longDescription: "",
    category: [],
    tags: [],
    documentation: "",
    logo: "",
    port: 0,
    version: "",
  };
}

const LONG_DESCRIPTION_FILE = "long-description.html";

function resolveLongDescription(
  templateDir: string | undefined,
  overrides: Partial<TemplateMetadata>,
  commentMetadata: ReturnType<typeof parseTemplateCommentMetadata>,
): string {
  if (overrides.longDescription?.trim()) {
    return overrides.longDescription.trim();
  }

  if (templateDir) {
    const htmlPath = path.join(templateDir, LONG_DESCRIPTION_FILE);
    if (fs.existsSync(htmlPath)) {
      return fs.readFileSync(htmlPath, "utf8").trim();
    }
  }

  return getTemplateLongDescriptionFromComments(commentMetadata);
}

/**
 * Merges compose comment metadata with optional slug overrides and slug defaults.
 */
function resolveTemplateMetadata(
  slug: string,
  yamlContent: string,
  templateDir?: string,
): TemplateMetadata {
  const commentMetadata = parseTemplateCommentMetadata(yamlContent);
  const overrides = metadataBySlug[slug] ?? {};
  const defaults = defaultMetadata(slug);

  return {
    name: overrides.name ?? defaults.name,
    shortDescription:
      overrides.shortDescription ??
      getTemplateDescriptionFromComments(commentMetadata),
    longDescription: resolveLongDescription(
      templateDir,
      overrides,
      commentMetadata,
    ),
    category:
      overrides.category && overrides.category.length > 0
        ? overrides.category
        : (commentMetadata.category ?? []),
    tags:
      overrides.tags && overrides.tags.length > 0
        ? overrides.tags
        : (commentMetadata.tags ?? []),
    documentation:
      overrides.documentation ?? commentMetadata.documentation?.trim() ?? "",
    logo: overrides.logo ?? commentMetadata.logo?.trim() ?? defaults.logo,
    port: overrides.port ?? commentMetadata.port ?? defaults.port,
    version: overrides.version ?? defaults.version,
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
      let templateDir: string | undefined;
      let yamlContent: string | undefined;
      let jsonData: Record<string, unknown> | undefined;
      let configData: Record<string, unknown> | undefined;

      if (stat.isDirectory()) {
        /*
         * Directory layout: <templates>/<slug>/docker-compose.yml
         * Optional schema overrides live in template.config.json beside compose.
         */
        slug = file;
        templateDir = filePath;
        const dockerComposePath = path.join(filePath, "docker-compose.yml");

        if (!fs.existsSync(dockerComposePath)) {
          continue;
        }

        try {
          yamlContent = fs.readFileSync(dockerComposePath, "utf8");
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
        templateDir = path.dirname(filePath);

        const potentialDir = path.join(templatesDir, slug);

        if (
          fs.existsSync(potentialDir) &&
          fs.statSync(potentialDir).isDirectory()
        ) {
          continue;
        }

        try {
          yamlContent = fs.readFileSync(filePath, "utf8");
          jsonData = parseComposeYaml(yamlContent, slug, filePath);
        } catch (error: unknown) {
          throw new Error(
            `Failed to read template "${slug}": ${toErrorMessage(error)}`,
          );
        }
      }

      if (!jsonData || !yamlContent) {
        continue;
      }

      /*
       * Compose version is removed before persistence because downstream
       * deployment logic expects parser-normalized compose without it.
       */
      delete jsonData.version;

      const metadata = resolveTemplateMetadata(slug, yamlContent, templateDir);
      const composeBase64 = encodeComposeToBase64(jsonData);
      const logo = metadata.logo
        ? encodeLogoReferenceToDataUri(templatesDir, metadata.logo)
        : "";

      const record: ServiceTemplateRecord = {
        slug,
        name: metadata.name,
        shortDescription: metadata.shortDescription,
        longDescription: metadata.longDescription,
        category: metadata.category,
        tags: metadata.tags,
        documentation: metadata.documentation,
        logo,
        compose: composeBase64,
        port: metadata.port,
        version: metadata.version,
        isActive: true,
      };

      if (configData?.env_schema) {
        record.envSchema = configData.env_schema;
      }

      if (configData?.port_schema) {
        record.portSchema = configData.port_schema;
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
