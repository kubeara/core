import * as fs from "fs";
import * as path from "path";

import * as yaml from "js-yaml";

interface TemplateMetadata {
  name: string;
  description: string;
  category: string;
  tags: string[];
  documentation: string;
  logo: string;
  port: number;
  version: string;
}

interface GeneratedServiceTemplate {
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
  env_schema?: Record<string, unknown>;
  port_schema?: Record<string, unknown>;
}

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
};

const templatesDir = path.join(
  process.cwd(),
  "apps/control-panel-app/templates",
);
const generatedDir = path.join(
  process.cwd(),
  "apps/control-panel-app/generated-templates",
);

if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

const files = fs.readdirSync(templatesDir);

for (const file of files) {
  const filePath = path.join(templatesDir, file);
  const stat = fs.statSync(filePath);

  let slug = file;
  let jsonData: Record<string, unknown> | undefined = undefined;
  interface TemplateConfigData {
    env_schema?: Record<string, unknown>;
    port_schema?: Record<string, unknown>;
  }

  let configData: TemplateConfigData | undefined = undefined;

  if (stat.isDirectory()) {
    slug = file;
    const dockerComposePath = path.join(filePath, "docker-compose.yml");
    if (!fs.existsSync(dockerComposePath)) {
      continue;
    }

    const yamlContent = fs.readFileSync(dockerComposePath, "utf8");
    jsonData = yaml.load(yamlContent) as Record<string, unknown>;

    const configPath = path.join(filePath, "template.config.json");
    if (fs.existsSync(configPath)) {
      try {
        configData = JSON.parse(
          fs.readFileSync(configPath, "utf8"),
        ) as TemplateConfigData;
      } catch (e) {
        console.warn(
          `Failed to parse template.config.json for ${slug}: ${String(e)}`,
        );
      }
    }
  } else {
    if (!file.endsWith(".yml")) {
      continue;
    }

    slug = file.replace(".yml", "");

    // If a folder with the same slug exists, prefer folder-based template (skip the single-file .yml)
    const potentialDir = path.join(templatesDir, slug);
    if (
      fs.existsSync(potentialDir) &&
      fs.statSync(potentialDir).isDirectory()
    ) {
      // skip this .yml because folder-based template takes precedence
      continue;
    }

    const yamlPath = path.join(templatesDir, file);

    const yamlContent = fs.readFileSync(yamlPath, "utf8");

    jsonData = yaml.load(yamlContent) as Record<string, unknown>;
    // no folder config for single-file templates
  }

  if (!jsonData) continue;

  delete jsonData.version;
  const metadata = metadataBySlug[slug] ?? {
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

  const composeBase64 = Buffer.from(JSON.stringify(jsonData)).toString(
    "base64",
  );

  const serviceTemplate: GeneratedServiceTemplate = {
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

  // If configData present, include env_schema and port_schema for runtime validation
  if (configData) {
    if (configData.env_schema)
      serviceTemplate.env_schema = configData.env_schema;
    if (configData.port_schema)
      serviceTemplate.port_schema = configData.port_schema;
  }

  const serviceTemplateJson = JSON.stringify(serviceTemplate, null, 2);

  fs.writeFileSync(
    path.join(generatedDir, `service-template-${slug}.json`),
    serviceTemplateJson,
  );

  fs.writeFileSync(
    path.join(generatedDir, `service-template-${slug}.base64`),
    composeBase64,
  );
}

console.log("Templates built successfully");
