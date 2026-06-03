import { z } from "zod";
import type { ApiTemplate, TemplateVariable } from "../types";

const TEMPLATE_ACCENT_COLORS: Record<string, string> = {
  postgresql: "#336791",
  postgres: "#336791",
  mongodb: "#47A248",
  mongo: "#47A248",
  redis: "#DC382D",
  n8n: "#EA4B71",
  mysql: "#00758F",
  kafka: "#231F20",
  rabbitmq: "#FF6600",
  elasticsearch: "#005571",
  minio: "#C72C48",
  grafana: "#F46800",
  prometheus: "#E6522C",
  nginx: "#009639",
  wordpress: "#21759B",
  nextcloud: "#0082C9",
  gitea: "#609926",
  keycloak: "#4D7A97",
  traefik: "#24A1C1",
  portainer: "#13BEF9",
};

export function getTemplateAccentColor(slug: string): string {
  const lower = slug.toLowerCase();
  for (const [key, color] of Object.entries(TEMPLATE_ACCENT_COLORS)) {
    if (lower === key || lower.startsWith(key)) {
      return color;
    }
  }

  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) & 0xffffff;
  }
  return `#${hash.toString(16).padStart(6, "0")}`;
}

function isPortVariable(name: string): boolean {
  return name.toUpperCase().startsWith("SERVICE_PORT_");
}

function variableFieldSchema(variable: TemplateVariable): z.ZodTypeAny {
  if (variable.type === "boolean") {
    return variable.hasRequiredOccurrence
      ? z.boolean()
      : z.boolean().optional();
  }

  if (variable.type === "number") {
    return variable.hasRequiredOccurrence
      ? z.coerce.number()
      : z.coerce.number().optional();
  }

  return variable.hasRequiredOccurrence
    ? z.string().trim().min(1, "This field is required")
    : z.string().trim().optional();
}

export function buildDeployFormSchema(template: ApiTemplate) {
  const variables = template.variables ?? [];
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const variable of variables) {
    shape[variable.name] = variableFieldSchema(variable);
  }

  return z.object(shape);
}

export type DeployFormValues = z.infer<ReturnType<typeof buildDeployFormSchema>>;

export function buildDeployFormDefaults(
  template: ApiTemplate,
): Record<string, string | number | boolean | undefined> {
  const defaults: Record<string, string | number | boolean | undefined> = {};

  for (const variable of template.variables ?? []) {
    if (variable.defaultValue === null || variable.defaultValue === "") {
      if (variable.type === "boolean") {
        defaults[variable.name] = false;
      }
      continue;
    }

    defaults[variable.name] = variable.defaultValue;
  }

  return defaults;
}

export function splitDeployFormValues(
  variables: TemplateVariable[],
  values: Record<string, unknown>,
): { env: Record<string, string>; ports: Record<string, string> } {
  const env: Record<string, string> = {};
  const ports: Record<string, string> = {};

  for (const variable of variables) {
    const raw = values[variable.name];
    if (raw === undefined || raw === null || raw === "") {
      continue;
    }

    const serialized = String(raw);
    if (isPortVariable(variable.name)) {
      ports[variable.name] = serialized;
    } else {
      env[variable.name] = serialized;
    }
  }

  return { env, ports };
}
