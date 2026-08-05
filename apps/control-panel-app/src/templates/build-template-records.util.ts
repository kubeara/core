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
  postgres: {
    name: "PostgreSQL",
    version: "16",
  },
  mysql: {
    name: "MySQL",
    version: "8.4",
  },
  mariadb: {
    name: "MariaDB",
    version: "11.4",
  },
  mongodb: {
    name: "MongoDB",
    version: "8.0",
  },
  redis: {
    name: "Redis",
    version: "7",
  },
  valkey: {
    name: "Valkey",
    version: "8",
  },
  clickhouse: {
    name: "ClickHouse",
    version: "25.3",
  },
  surrealdb: {
    name: "SurrealDB",
    version: "latest",
  },
  n8n: {
    name: "n8n",
    version: "2.10.2",
  },
  "n8n-with-postgresql": {
    name: "n8n with PostgreSQL",
    version: "2.10.2",
  },
  "n8n-with-postgres-and-worker": {
    name: "n8n with Postgres and Worker",
    version: "2.10.2",
  },
  hatchet: {
    name: "Hatchet",
    version: "latest",
  },
  prefect: {
    name: "Prefect",
    version: "3",
  },
  trigger: {
    name: "Trigger.dev",
    version: "v3",
  },
  "evolution-api": {
    name: "Evolution API",
    version: "latest",
  },
  "uptime-kuma": {
    name: "Uptime Kuma",
    version: "2",
  },
  grafana: {
    name: "Grafana",
    version: "13.0.2",
  },
  "grafana-with-postgresql": {
    name: "Grafana with PostgreSQL",
    version: "13.0.2",
  },
  prometheus: {
    name: "Prometheus",
    version: "3.12.0",
  },
  beszel: {
    name: "Beszel",
    version: "latest",
  },
  diun: {
    name: "DIUN",
    version: "latest",
  },
  glances: {
    name: "Glances",
    version: "latest",
  },
  openobserve: {
    name: "OpenObserve",
    version: "latest",
  },
  gitea: {
    name: "Gitea",
    version: "1.26.2",
  },
  forgejo: {
    name: "Forgejo",
    version: "12",
  },
  "forgejo-with-runner-dind": {
    name: "Forgejo with Runner (DinD)",
    version: "12",
  },
  "forgejo-with-runner-docker-socket": {
    name: "Forgejo with Runner (Docker Socket)",
    version: "12",
  },
  onedev: {
    name: "OneDev",
    version: "16.0",
  },
  "gitlab-ce": {
    name: "GitLab CE",
    version: "latest",
  },
  "code-server": {
    name: "Code Server",
    version: "4.123.0",
  },
  "sql-server": {
    name: "SQL Server",
    version: "2025",
  },
  wordpress: {
    name: "WordPress",
    version: "6.8",
  },
  freescout: {
    name: "FreeScout",
    version: "latest",
  },
  directus: {
    name: "Directus",
    version: "11.5.5",
  },
  strapi: {
    name: "Strapi",
    version: "5.30.1",
  },
  pocketbase: {
    name: "PocketBase",
    version: "latest",
  },
  monica: {
    name: "Monica",
    version: "4.1.2",
  },
  minio: {
    name: "MinIO",
    version: "2025-09",
  },
  nextcloud: {
    name: "Nextcloud",
    version: "latest",
  },
  seafile: {
    name: "Seafile",
    version: "13.0",
  },
  flowise: {
    name: "Flowise",
    version: "latest",
  },
  "anything-llm": {
    name: "AnythingLLM",
    version: "latest",
  },
  litellm: {
    name: "LiteLLM",
    version: "main-stable",
  },
  ollama: {
    name: "Ollama",
    version: "latest",
  },
  "open-webui": {
    name: "Open WebUI",
    version: "main",
  },
  "ollama-with-webui": {
    name: "Ollama with Open WebUI",
    version: "latest",
  },
  qdrant: {
    name: "Qdrant",
    version: "1.13",
  },
  weaviate: {
    name: "Weaviate",
    version: "1.27",
  },
  langfuse: {
    name: "Langfuse",
    version: "3",
  },
  netdata: {
    name: "Netdata",
    version: "stable",
  },
  activepieces: {
    name: "Activepieces",
    version: "0.83",
  },
  windmill: {
    name: "Windmill",
    version: "1.661",
  },
  "node-red": {
    name: "Node-RED",
    version: "4.1",
  },
  plausible: {
    name: "Plausible Analytics",
    version: "3.2",
  },
  umami: {
    name: "Umami Analytics",
    version: "latest",
  },
  matomo: {
    name: "Matomo",
    version: "5",
  },
  "drone-ci": {
    name: "Drone CI",
    version: "2",
  },
  "woodpecker-ci": {
    name: "Woodpecker CI",
    version: "3",
  },
  ghost: {
    name: "Ghost",
    version: "5",
  },
  healthchecks: {
    name: "Healthchecks.io",
    version: "latest",
  },
  vaultwarden: {
    name: "Vaultwarden",
    version: "latest",
  },
  authentik: {
    name: "Authentik",
    version: "2025.8",
  },
  authelia: {
    name: "Authelia",
    version: "4.39",
  },
  keycloak: {
    name: "Keycloak",
    version: "26.0",
  },
  logto: {
    name: "Logto",
    version: "latest",
  },
  nocodb: {
    name: "NocoDB",
    version: "0.263",
  },
  affine: {
    name: "AFFiNE",
    version: "stable",
  },
  signoz: {
    name: "SigNoz",
    version: "0.128",
  },
  wakapi: {
    name: "Wakapi",
    version: "latest",
  },
  appwrite: {
    name: "Appwrite",
    version: "1.6",
  },
  "flowise-with-databases": {
    name: "Flowise (with databases)",
    version: "latest",
  },
  langflow: {
    name: "Langflow",
    version: "latest",
  },
  "label-studio": {
    name: "Label Studio",
    version: "latest",
  },
  librechat: {
    name: "LibreChat",
    version: "latest",
  },
  "lobe-chat": {
    name: "LobeChat",
    version: "latest",
  },
  "mage-ai": {
    name: "Mage AI",
    version: "latest",
  },
  mindsdb: {
    name: "MindsDB",
    version: "latest",
  },
  bifrost: {
    name: "Bifrost",
    version: "latest",
  },
  comfyui: {
    name: "ComfyUI",
    version: "latest",
  },
  "continue-dev": {
    name: "Continue (Ollama)",
    version: "latest",
  },
  helicone: {
    name: "Helicone",
    version: "latest",
  },
  "hermes-agent-with-webui": {
    name: "Hermes Agent (with Web UI)",
    version: "latest",
  },
  "lm-studio": {
    name: "LM Studio",
    version: "latest",
  },
  metamcp: {
    name: "MetaMCP",
    version: "2.4",
  },
  openclaw: {
    name: "OpenClaw",
    version: "2026.2.6",
  },
  "stable-diffusion-webui": {
    name: "Stable Diffusion WebUI",
    version: "latest",
  },
  tabby: {
    name: "Tabby",
    version: "latest",
  },
  argilla: {
    name: "Argilla",
    version: "2.2",
  },
  dify: {
    name: "Dify",
    version: "latest",
  },
  zep: {
    name: "Zep",
    version: "latest",
  },
  unstructured: {
    name: "Unstructured",
    version: "latest",
  },
  semgrep: {
    name: "Semgrep",
    version: "latest",
  },
  trivy: {
    name: "Trivy",
    version: "latest",
  },
  checkov: {
    name: "Checkov",
    version: "latest",
  },
  gitleaks: {
    name: "Gitleaks",
    version: "latest",
  },
  "neon-ws-proxy": {
    name: "Neon WS Proxy",
    version: "latest",
  },
  kuzzle: {
    name: "Kuzzle",
    version: "2.56",
  },
  autobase: {
    name: "Autobase",
    version: "2.5",
  },
  convex: {
    name: "Convex",
    version: "latest",
  },
  typesense: {
    name: "Typesense",
    version: "28.0",
  },
  trailbase: {
    name: "TrailBase",
    version: "latest",
  },
  supabase: {
    name: "Supabase",
    version: "2026.06",
  },
  rabbitmq: {
    name: "RabbitMQ",
    version: "3",
  },
  chroma: {
    name: "Chroma",
    version: "1.0",
  },
  "deno-kv": {
    name: "Deno KV",
    version: "latest",
  },
  edgedb: {
    name: "EdgeDB",
    version: "6",
  },
  electricsql: {
    name: "ElectricSQL",
    version: "latest",
  },
  elasticsearch: {
    name: "Elasticsearch",
    version: "8.19",
  },
  "elasticsearch-with-kibana": {
    name: "Elasticsearch with Kibana",
    version: "8.19",
  },
  meilisearch: {
    name: "Meilisearch",
    version: "1.22",
  },
  searxng: {
    name: "SearXNG",
    version: "latest",
  },
  dashy: {
    name: "Dashy",
    version: "latest",
  },
  heimdall: {
    name: "Heimdall",
    version: "latest",
  },
  homarr: {
    name: "Homarr",
    version: "latest",
  },
  homepage: {
    name: "Homepage",
    version: "latest",
  },
  organizr: {
    name: "Organizr",
    version: "latest",
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
