import {
  extractComposeVariables,
  type ComposeVariableRef,
  type TemplateVariableDefinition,
} from "@shared/common";
import * as yaml from "js-yaml";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface ParsedCustomEnvEntry {
  name: string;
  defaultValue: string | number | boolean | null;
  hasDefaultSyntax: boolean;
  hasRequiredOccurrence: boolean;
}

/**
 * Extracts environment variables from a user-uploaded Docker Compose file.
 * Supports mapping and array environment formats across all services, plus
 * ${VAR} placeholders found anywhere in the compose document.
 * Intended only for custom uploads; predefined templates use parseTemplateVariables.
 */
export function parseCustomComposeEnvironmentVariables(
  composeYaml: string,
): TemplateVariableDefinition[] {
  try {
    const byName = new Map<string, ParsedCustomEnvEntry>();

    let parsed: unknown;
    try {
      parsed = yaml.load(composeYaml);
    } catch {
      return [];
    }

    collectEnvironmentFromServices(parsed, byName);
    mergeComposePlaceholderVariables(composeYaml, byName);

    return Array.from(byName.values())
      .map(toTemplateVariableDefinition)
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

/**
 * Walks all service definitions and collects environment keys/values.
 */
function collectEnvironmentFromServices(
  parsed: unknown,
  byName: Map<string, ParsedCustomEnvEntry>,
): void {
  try {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return;
    }

    const services = (parsed as Record<string, unknown>).services;
    if (!services || typeof services !== "object" || Array.isArray(services)) {
      return;
    }

    for (const serviceDefinition of Object.values(services)) {
      try {
        if (
          !serviceDefinition ||
          typeof serviceDefinition !== "object" ||
          Array.isArray(serviceDefinition)
        ) {
          continue;
        }

        const environment = (serviceDefinition as Record<string, unknown>)
          .environment;
        if (environment === undefined || environment === null) {
          continue;
        }

        collectEnvironmentBlock(environment, byName);
      } catch {
        // Skip malformed service entries and continue collecting others.
      }
    }
  } catch {
    // Ignore unexpected service-map failures; caller still returns collected vars.
  }
}

/**
 * Parses a service environment block in mapping or array format.
 */
function collectEnvironmentBlock(
  environment: unknown,
  byName: Map<string, ParsedCustomEnvEntry>,
): void {
  try {
    if (Array.isArray(environment)) {
      collectEnvironmentArrayEntries(environment, byName);
      return;
    }

    if (!environment || typeof environment !== "object") {
      return;
    }

    collectEnvironmentMappingEntries(
      environment as Record<string, unknown>,
      byName,
    );
  } catch {
    // Ignore malformed environment blocks.
  }
}

/**
 * Parses environment array entries such as KEY=value or bare KEY passthroughs.
 */
function collectEnvironmentArrayEntries(
  entries: unknown[],
  byName: Map<string, ParsedCustomEnvEntry>,
): void {
  try {
    for (const entry of entries) {
      try {
        if (typeof entry !== "string") {
          continue;
        }

        const trimmed = entry.trim();
        if (!trimmed) {
          continue;
        }

        const equalsIndex = trimmed.indexOf("=");
        if (equalsIndex === -1) {
          if (IDENTIFIER_PATTERN.test(trimmed)) {
            upsertCustomEnvEntry(byName, {
              name: trimmed,
              defaultValue: null,
              hasDefaultSyntax: false,
              hasRequiredOccurrence: true,
            });
          }
          continue;
        }

        const name = trimmed.slice(0, equalsIndex).trim();
        const rawValue = trimmed.slice(equalsIndex + 1).trim();
        if (!IDENTIFIER_PATTERN.test(name)) {
          continue;
        }

        upsertCustomEnvEntry(byName, parseEnvironmentValue(name, rawValue));
      } catch {
        // Skip malformed array entries.
      }
    }
  } catch {
    // Ignore unexpected array iteration failures.
  }
}

/**
 * Parses environment mapping entries such as KEY: value.
 */
function collectEnvironmentMappingEntries(
  environment: Record<string, unknown>,
  byName: Map<string, ParsedCustomEnvEntry>,
): void {
  try {
    for (const [key, rawValue] of Object.entries(environment)) {
      try {
        if (!IDENTIFIER_PATTERN.test(key)) {
          continue;
        }

        if (typeof rawValue === "string") {
          upsertCustomEnvEntry(byName, parseEnvironmentValue(key, rawValue));
          continue;
        }

        if (typeof rawValue === "number" || typeof rawValue === "boolean") {
          upsertCustomEnvEntry(byName, {
            name: key,
            defaultValue: rawValue,
            hasDefaultSyntax: true,
            hasRequiredOccurrence: false,
          });
          continue;
        }

        if (rawValue === null || rawValue === undefined) {
          continue;
        }

        upsertCustomEnvEntry(byName, {
          name: key,
          defaultValue: formatNonStringEnvironmentValue(rawValue),
          hasDefaultSyntax: true,
          hasRequiredOccurrence: false,
        });
      } catch {
        // Skip malformed mapping entries.
      }
    }
  } catch {
    // Ignore unexpected mapping iteration failures.
  }
}

/**
 * Parses a string environment value, detecting ${VAR} / ${VAR:-default} placeholders.
 */
function parseEnvironmentValue(
  name: string,
  rawValue: string,
): ParsedCustomEnvEntry {
  try {
    const placeholder = parseInlinePlaceholder(rawValue.trim());
    if (placeholder && placeholder.name === name) {
      return {
        name,
        defaultValue: parseDefaultValue(
          placeholder.defaultValue === null
            ? undefined
            : placeholder.defaultValue,
          name,
        ),
        hasDefaultSyntax: placeholder.hasDefaultSyntax,
        hasRequiredOccurrence: placeholder.hasRequiredOccurrence,
      };
    }

    return {
      name,
      defaultValue: rawValue,
      hasDefaultSyntax: true,
      hasRequiredOccurrence: false,
    };
  } catch {
    return {
      name,
      defaultValue: rawValue,
      hasDefaultSyntax: true,
      hasRequiredOccurrence: false,
    };
  }
}

/**
 * Returns placeholder metadata when a value is exactly ${VAR} or ${VAR:-default}.
 */
function parseInlinePlaceholder(value: string): ParsedCustomEnvEntry | null {
  try {
    const requiredMatch = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value);
    if (requiredMatch) {
      return {
        name: requiredMatch[1],
        defaultValue: null,
        hasDefaultSyntax: false,
        hasRequiredOccurrence: true,
      };
    }

    const defaultMatch = /^\$\{([A-Za-z_][A-Za-z0-9_]*):-([\s\S]*)\}$/.exec(
      value,
    );
    if (defaultMatch) {
      return {
        name: defaultMatch[1],
        defaultValue: defaultMatch[2],
        hasDefaultSyntax: true,
        hasRequiredOccurrence: false,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Adds compose-wide ${VAR} placeholders without overriding explicit environment values.
 */
function mergeComposePlaceholderVariables(
  composeYaml: string,
  byName: Map<string, ParsedCustomEnvEntry>,
): void {
  try {
    let variables: ComposeVariableRef[];
    try {
      variables = extractComposeVariables(composeYaml);
    } catch {
      return;
    }

    for (const variable of variables) {
      try {
        if (byName.has(variable.name)) {
          continue;
        }

        upsertCustomEnvEntry(byName, {
          name: variable.name,
          defaultValue: parseDefaultValue(variable.defaultValue, variable.name),
          hasDefaultSyntax: Boolean(variable.hasDefaultSyntax),
          hasRequiredOccurrence: Boolean(variable.hasRequiredOccurrence),
        });
      } catch {
        // Skip individual placeholder merge failures.
      }
    }
  } catch {
    // Ignore unexpected placeholder merge failures.
  }
}

/**
 * Inserts or merges a parsed custom environment entry by variable name.
 */
function upsertCustomEnvEntry(
  byName: Map<string, ParsedCustomEnvEntry>,
  entry: ParsedCustomEnvEntry,
): void {
  try {
    const existing = byName.get(entry.name);
    if (!existing) {
      byName.set(entry.name, entry);
      return;
    }

    if (entry.hasDefaultSyntax && entry.defaultValue !== null) {
      existing.defaultValue = entry.defaultValue;
      existing.hasDefaultSyntax = true;
    }

    if (entry.hasRequiredOccurrence) {
      existing.hasRequiredOccurrence = true;
    }
  } catch {
    // Ignore merge failures for a single entry.
  }
}

/**
 * Converts a parsed custom environment entry into the shared template variable shape.
 */
function toTemplateVariableDefinition(
  entry: ParsedCustomEnvEntry,
): TemplateVariableDefinition {
  try {
    const type = inferVariableType(entry.name, entry.defaultValue);
    return {
      name: entry.name,
      type,
      required: entry.hasRequiredOccurrence,
      defaultValue: normalizeDefaultValue(entry.defaultValue, type),
      hasRequiredOccurrence: entry.hasRequiredOccurrence,
      hasDefaultSyntax: entry.hasDefaultSyntax,
    };
  } catch {
    return {
      name: entry.name,
      type: "string",
      required: entry.hasRequiredOccurrence,
      defaultValue:
        entry.defaultValue === null ? null : String(entry.defaultValue),
      hasRequiredOccurrence: entry.hasRequiredOccurrence,
      hasDefaultSyntax: entry.hasDefaultSyntax,
    };
  }
}

/**
 * Infers a form field type from the variable name and default value.
 */
function inferVariableType(
  name: string,
  defaultValue: string | number | boolean | null,
): TemplateVariableDefinition["type"] {
  try {
    if (defaultValue === null) {
      return name.startsWith("SERVICE_PORT_") ? "number" : "string";
    }

    if (typeof defaultValue === "boolean") {
      return "boolean";
    }

    if (typeof defaultValue === "number") {
      return "number";
    }

    const trimmed = defaultValue.trim();
    const normalized = trimmed.toLowerCase();
    if (normalized === "true" || normalized === "false") {
      return "boolean";
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return "number";
    }

    return "string";
  } catch {
    return "string";
  }
}

/**
 * Normalizes default values to the inferred variable type.
 */
function normalizeDefaultValue(
  defaultValue: string | number | boolean | null,
  type: TemplateVariableDefinition["type"],
): string | number | boolean | null {
  try {
    if (defaultValue === null) {
      return null;
    }

    if (type === "boolean" && typeof defaultValue === "string") {
      return defaultValue.trim().toLowerCase() === "true";
    }

    if (type === "number" && typeof defaultValue === "string") {
      const parsed = Number(defaultValue.trim());
      return Number.isNaN(parsed) ? null : parsed;
    }

    return defaultValue;
  } catch {
    return null;
  }
}

/**
 * Parses a placeholder default into a typed default value when possible.
 */
function parseDefaultValue(
  raw: string | number | boolean | null | undefined,
  name: string,
): string | number | boolean | null {
  try {
    if (raw === undefined || raw === null || raw === "") {
      return null;
    }

    const type = inferVariableType(name, raw);
    return normalizeDefaultValue(raw, type);
  } catch {
    return null;
  }
}

/**
 * Formats non-string YAML environment values as strings for display defaults.
 */
function formatNonStringEnvironmentValue(value: unknown): string {
  try {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      return String(value);
    }

    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export interface CustomComposeResolvedEnv {
  env: Record<string, string>;
  ports: Record<string, number>;
  generatedKeys: string[];
  requiredKeys: Set<string>;
}

/**
 * Builds deployment env/port maps for custom compose using extracted service
 * environment values merged with any request overrides.
 */
export function resolveCustomComposeDeploymentVariables(
  composeYaml: string,
  requestEnv: Record<string, unknown> = {},
  requestPorts: Record<string, unknown> = {},
): CustomComposeResolvedEnv {
  try {
    const variables = parseCustomComposeEnvironmentVariables(composeYaml);
    const env: Record<string, string> = {};
    const ports: Record<string, number> = {};
    const requiredKeys = new Set<string>();

    for (const variable of variables) {
      try {
        if (variable.hasRequiredOccurrence) {
          requiredKeys.add(variable.name);
        }

        if (variable.defaultValue === null) {
          continue;
        }

        if (variable.name.startsWith("SERVICE_PORT_")) {
          const parsed = Number(variable.defaultValue);
          if (!Number.isNaN(parsed)) {
            ports[variable.name] = parsed;
          }
          continue;
        }

        env[variable.name] = String(variable.defaultValue);
      } catch {
        // Skip individual variable resolution failures.
      }
    }

    for (const [key, value] of Object.entries(requestEnv)) {
      try {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          env[key] = String(value);
        }
      } catch {
        // Skip malformed request env overrides.
      }
    }

    for (const [key, value] of Object.entries(requestPorts)) {
      try {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          const parsed = Number(value);
          if (!Number.isNaN(parsed)) {
            ports[key] = parsed;
          }
        }
      } catch {
        // Skip malformed request port overrides.
      }
    }

    return { env, ports, generatedKeys: [], requiredKeys };
  } catch (error) {
    throw new Error(
      `Failed to resolve custom compose deployment variables: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
