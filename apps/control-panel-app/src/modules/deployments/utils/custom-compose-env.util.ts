import {
  buildDeployedComposeYaml,
  extractComposeVariables,
  findMissingComposeVariables,
  resolveComposeEnvironment,
  type ComposeVariableRef,
  type ResolvedComposeEnv,
  type TemplateVariableDefinition,
} from "@shared/common";
import * as yaml from "js-yaml";

import {
  CUSTOM_COMPOSE_ENV_IDENTIFIER_PATTERN,
  CUSTOM_ENV_MAX_BYTES,
} from "../constants/custom-compose.constants";
import type {
  CustomComposeCombinedValidationResult,
  CustomComposeEncryptedContent,
  CustomComposeResolvedEnv,
  CustomComposeServiceEnvironment,
  CustomComposeValidationIssue,
  DotEnvParseResult,
  ParsedCustomEnvEntry,
} from "./custom-compose.types";

/**
 * Builds the JSON payload stored in encryptedComposeContent for custom compose
 * deployments. Includes resolved compose YAML and optional deployed .env text.
 */
export function buildEncryptedCustomComposePayload(
  composeYaml: string,
  mergedEnv: Record<string, string>,
  mergedPorts: Record<string, number>,
  envFileContent?: string,
): string {
  const payload: CustomComposeEncryptedContent = {
    composeYaml: buildDeployedComposeYaml(composeYaml, mergedEnv, mergedPorts),
  };

  const deployedEnvFileContent = buildDeployedEnvFileContent(
    envFileContent,
    mergedEnv,
    mergedPorts,
  ).trim();

  if (deployedEnvFileContent) {
    payload.envFileContent = deployedEnvFileContent;
  }

  return JSON.stringify(payload);
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
          if (CUSTOM_COMPOSE_ENV_IDENTIFIER_PATTERN.test(trimmed)) {
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
        if (!CUSTOM_COMPOSE_ENV_IDENTIFIER_PATTERN.test(name)) {
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
        if (!CUSTOM_COMPOSE_ENV_IDENTIFIER_PATTERN.test(key)) {
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

/**
 * Parses optional .env file content into key/value pairs.
 */
export function parseDotEnvFile(content: string): DotEnvParseResult {
  const issues: CustomComposeValidationIssue[] = [];
  const variables: Record<string, string> = {};

  try {
    const trimmed = content.trim();
    if (!trimmed) {
      return { variables, issues };
    }

    const byteLength = Buffer.byteLength(trimmed, "utf8");
    if (byteLength > CUSTOM_ENV_MAX_BYTES) {
      return {
        variables,
        issues: [
          {
            path: ".env",
            message: `.env file exceeds maximum size of ${CUSTOM_ENV_MAX_BYTES} bytes`,
          },
        ],
      };
    }

    const lines = trimmed.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      const rawLine = lines[index];
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      if (line.startsWith("export ")) {
        issues.push({
          path: `.env:${lineNumber}`,
          message: "export prefix is not supported in .env files",
        });
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        issues.push({
          path: `.env:${lineNumber}`,
          message: "Invalid .env line; expected KEY=VALUE format",
        });
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();

      if (!CUSTOM_COMPOSE_ENV_IDENTIFIER_PATTERN.test(key)) {
        issues.push({
          path: `.env:${lineNumber}`,
          message: `Invalid environment variable name "${key}"`,
        });
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(variables, key)) {
        issues.push({
          path: `.env:${lineNumber}`,
          message: `Duplicate environment variable "${key}"`,
        });
        continue;
      }

      variables[key] = parseDotEnvValue(rawValue);
    }

    return { variables, issues };
  } catch (error) {
    return {
      variables,
      issues: [
        {
          path: ".env",
          message:
            error instanceof Error
              ? error.message
              : "Failed to parse .env file",
        },
      ],
    };
  }
}

/**
 * Validates compose and optional .env together, resolves placeholders, and
 * returns per-service environment previews with sensitive values masked.
 */
export function validateCustomComposeWithEnvFile(
  composeYaml: string,
  envFileContent?: string,
  options?: { allowIncompleteEnv?: boolean },
): CustomComposeCombinedValidationResult {
  const allowIncompleteEnv = Boolean(options?.allowIncompleteEnv);
  const issues: CustomComposeValidationIssue[] = [];
  const dotEnvResult = parseDotEnvFile(envFileContent ?? "");
  issues.push(...dotEnvResult.issues);

  if (issues.length > 0) {
    return {
      issues,
      dotEnvVariables: {},
      resolved: { env: {}, ports: {}, generatedKeys: [] },
      serviceEnvironments: [],
    };
  }

  const customResolved = resolveCustomComposeDeploymentVariables(
    composeYaml,
    {},
    {},
    dotEnvResult.variables,
  );

  let resolved: ResolvedComposeEnv;
  try {
    resolved = resolveComposeEnvironment({
      compose: composeYaml,
      userEnv: customResolved.env,
      userPorts: customResolved.ports,
    });
  } catch (error) {
    issues.push({
      path: "variables",
      message:
        error instanceof Error
          ? error.message
          : "Failed to resolve compose variables",
    });
    return {
      issues,
      dotEnvVariables: dotEnvResult.variables,
      resolved: { env: {}, ports: {}, generatedKeys: [] },
      serviceEnvironments: [],
    };
  }

  const missing = findMissingComposeVariables(composeYaml, resolved);
  if (missing.length > 0 && !allowIncompleteEnv) {
    issues.push({
      path: "variables",
      message: `Missing required environment variables: ${missing.join(", ")}`,
    });
    return {
      issues,
      dotEnvVariables: dotEnvResult.variables,
      resolved,
      serviceEnvironments: [],
    };
  }

  const envFileIssues = validateComposeEnvFileReferences(
    composeYaml,
    envFileContent,
  );
  if (envFileIssues.length > 0 && !allowIncompleteEnv) {
    issues.push(...envFileIssues);
    return {
      issues,
      dotEnvVariables: dotEnvResult.variables,
      resolved,
      serviceEnvironments: [],
    };
  }

  const serviceEnvironments = buildCustomComposeServiceEnvironments(
    composeYaml,
    dotEnvResult.variables,
    resolved.env,
    resolved.ports,
  );

  return {
    issues: allowIncompleteEnv ? [] : issues,
    dotEnvVariables: dotEnvResult.variables,
    resolved,
    serviceEnvironments,
  };
}

/**
 * Builds the deployed .env file content from user input and resolved values.
 */
export function buildDeployedEnvFileContent(
  envFileContent: string | undefined,
  mergedEnv: Record<string, string>,
  mergedPorts: Record<string, number>,
): string {
  const lookup = buildEnvLookup(mergedEnv, mergedPorts);

  if (envFileContent?.trim()) {
    return resolveEnvFilePlaceholders(envFileContent.trim(), lookup);
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(mergedEnv)) {
    lines.push(`${key}=${serializeDotEnvValue(value)}`);
  }
  for (const [key, value] of Object.entries(mergedPorts)) {
    if (mergedEnv[key] === undefined) {
      lines.push(`${key}=${String(value)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Builds deployment env/port maps for custom compose using extracted service
 * environment values merged with any request overrides and optional .env file.
 */
export function resolveCustomComposeDeploymentVariables(
  composeYaml: string,
  requestEnv: Record<string, unknown> = {},
  requestPorts: Record<string, unknown> = {},
  dotEnvVariables: Record<string, string> = {},
): CustomComposeResolvedEnv {
  try {
    const variables = parseCustomComposeEnvironmentVariables(composeYaml);
    const env: Record<string, string> = { ...dotEnvVariables };
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

        if (env[variable.name] === undefined) {
          env[variable.name] = String(variable.defaultValue);
        }
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

/**
 * Parses a raw environment value from a .env file.
 * @param rawValue
 * @returns
 */
function parseDotEnvValue(rawValue: string): string {
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }

  return rawValue;
}

/**
 * Serializes a raw environment value from a .env file.
 * @param value
 * @returns
 */
function serializeDotEnvValue(value: string): string {
  if (!/[\n\r"'#=\s]/u.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

/**
 * Builds an environment lookup from merged environment and port values.
 * @param mergedEnv
 * @param mergedPorts
 * @returns
 */
function buildEnvLookup(
  mergedEnv: Record<string, string>,
  mergedPorts: Record<string, number>,
): Record<string, string> {
  const lookup: Record<string, string> = { ...mergedEnv };
  for (const [key, value] of Object.entries(mergedPorts)) {
    if (lookup[key] === undefined) {
      lookup[key] = String(value);
    }
  }
  return lookup;
}

/**
 * Resolves environment file placeholders in a string.
 * @param envFileContent
 * @param lookup
 * @returns
 */
function resolveEnvFilePlaceholders(
  envFileContent: string,
  lookup: Record<string, string>,
): string {
  const lines = envFileContent.split(/\r?\n/u);
  const resolvedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return line;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      return line;
    }

    const key = line.slice(0, separatorIndex);
    const rawValue = line.slice(separatorIndex + 1);
    const resolvedValue = resolveInlineEnvValue(rawValue.trim(), lookup);
    return `${key}=${resolvedValue}`;
  });

  return resolvedLines.join("\n");
}

/**
 * Resolves inline environment values in a string.
 * @param rawValue
 * @param lookup
 * @returns
 */
function resolveInlineEnvValue(
  rawValue: string,
  lookup: Record<string, string>,
): string {
  const placeholder = parseInlinePlaceholder(rawValue);
  if (placeholder) {
    const resolved = lookup[placeholder.name];
    if (resolved !== undefined) {
      return resolved;
    }

    if (
      placeholder.hasDefaultSyntax &&
      placeholder.defaultValue !== null &&
      placeholder.defaultValue !== undefined
    ) {
      return String(placeholder.defaultValue);
    }

    return rawValue;
  }

  return resolveEnvValueSubstitutions(rawValue, lookup);
}

/**
 * Resolves environment value substitutions in a string.
 * @param value
 * @param lookup
 * @returns
 */
function resolveEnvValueSubstitutions(
  value: string,
  lookup: Record<string, string>,
): string {
  let result = "";
  let index = 0;

  while (index < value.length) {
    const dollarIndex = value.indexOf("$", index);
    if (dollarIndex === -1) {
      result += value.slice(index);
      break;
    }

    result += value.slice(index, dollarIndex);

    if (value[dollarIndex + 1] === "$") {
      result += "$";
      index = dollarIndex + 2;
      continue;
    }

    if (value[dollarIndex + 1] === "{") {
      const contentStart = dollarIndex + 2;
      const closeIndex = value.indexOf("}", contentStart);
      if (closeIndex === -1) {
        result += value.slice(dollarIndex);
        break;
      }

      const raw = value.slice(contentStart, closeIndex).trim();
      const defaultIndex = raw.indexOf(":-");
      const name =
        defaultIndex === -1 ? raw : raw.slice(0, defaultIndex).trim();
      const defaultValue =
        defaultIndex === -1 ? undefined : raw.slice(defaultIndex + 2);
      const resolved = lookup[name];
      if (resolved !== undefined) {
        result += resolved;
      } else if (defaultValue !== undefined) {
        result += defaultValue;
      } else {
        result += value.slice(dollarIndex, closeIndex + 1);
      }
      index = closeIndex + 1;
      continue;
    }

    result += value[dollarIndex];
    index = dollarIndex + 1;
  }

  return result;
}

/**
 * Validates environment file references in a compose YAML file.
 * @param composeYaml
 * @param envFileContent
 * @returns
 */
function validateComposeEnvFileReferences(
  composeYaml: string,
  envFileContent?: string,
): CustomComposeValidationIssue[] {
  const issues: CustomComposeValidationIssue[] = [];

  try {
    const parsed = yaml.load(composeYaml);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return issues;
    }

    const services = (parsed as Record<string, unknown>).services;
    if (!services || typeof services !== "object" || Array.isArray(services)) {
      return issues;
    }

    for (const [serviceName, serviceDefinition] of Object.entries(services)) {
      if (
        !serviceDefinition ||
        typeof serviceDefinition !== "object" ||
        Array.isArray(serviceDefinition)
      ) {
        continue;
      }

      const envFile = (serviceDefinition as Record<string, unknown>).env_file;
      if (envFile === undefined || envFile === null) {
        continue;
      }

      const references = normalizeEnvFileReferences(envFile);
      for (const reference of references) {
        if (isUploadedEnvFileReference(reference)) {
          if (!envFileContent?.trim()) {
            issues.push({
              path: `services.${serviceName}.env_file`,
              message:
                'Service references ".env" but no .env file was uploaded',
            });
          }
          continue;
        }

        issues.push({
          path: `services.${serviceName}.env_file`,
          message: `Unsupported env_file reference "${reference}". Upload a ".env" file or use inline environment values`,
        });
      }
    }

    return issues;
  } catch {
    return issues;
  }
}

/**
 * Normalizes environment file references to an array of strings.
 * @param envFile
 * @returns
 */
function normalizeEnvFileReferences(envFile: unknown): string[] {
  if (typeof envFile === "string") {
    return [envFile.trim()].filter((value) => value.length > 0);
  }

  if (Array.isArray(envFile)) {
    return envFile
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((value) => value.length > 0);
  }

  return [];
}

/**
 * Checks if a reference is an uploaded .env file.
 * @param reference
 * @returns
 */
function isUploadedEnvFileReference(reference: string): boolean {
  const normalized = reference.replace(/^\.\//u, "").trim();
  return normalized === ".env" || normalized.endsWith("/.env");
}

/**
 * Builds custom compose service environments from a compose YAML file and a .env file.
 * @param composeYaml
 * @param dotEnvVariables
 * @param mergedEnv
 * @param mergedPorts
 * @returns
 */
function buildCustomComposeServiceEnvironments(
  composeYaml: string,
  dotEnvVariables: Record<string, string>,
  mergedEnv: Record<string, string>,
  mergedPorts: Record<string, number>,
): CustomComposeServiceEnvironment[] {
  const lookup = buildEnvLookup(mergedEnv, mergedPorts);
  const parsed = yaml.load(composeYaml);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }

  const services = (parsed as Record<string, unknown>).services;
  if (!services || typeof services !== "object" || Array.isArray(services)) {
    return [];
  }

  const previews: CustomComposeServiceEnvironment[] = [];

  // Preserve Compose service declaration order (do not sort alphabetically).
  for (const [serviceName, serviceDefinition] of Object.entries(services)) {
    if (
      !serviceDefinition ||
      typeof serviceDefinition !== "object" ||
      Array.isArray(serviceDefinition)
    ) {
      continue;
    }

    const service = serviceDefinition as Record<string, unknown>;
    const serviceEnv: Record<string, string> = {};

    const envFileReferences = normalizeEnvFileReferences(service.env_file);
    for (const reference of envFileReferences) {
      if (isUploadedEnvFileReference(reference)) {
        for (const [key, value] of Object.entries(dotEnvVariables)) {
          serviceEnv[key] = resolveInlineEnvValue(value, lookup);
        }
      }
    }

    collectResolvedServiceEnvironment(service.environment, serviceEnv, lookup);
    collectServiceInterpolationVariables(service, serviceEnv, lookup);

    previews.push({
      serviceName,
      env: serviceEnv,
    });
  }

  return previews;
}

/**
 * Adds ${VAR} / $VAR interpolations from any service field (ports, volumes,
 * image, command, labels, etc.), not only the environment block.
 */
function collectServiceInterpolationVariables(
  service: Record<string, unknown>,
  serviceEnv: Record<string, string>,
  lookup: Record<string, string>,
): void {
  const placeholderNames = new Set<string>();
  collectPlaceholderNamesFromNode(service, placeholderNames);

  for (const name of placeholderNames) {
    if (serviceEnv[name] !== undefined) {
      continue;
    }

    serviceEnv[name] = lookup[name] ?? "";
  }
}

/**
 * Collects Compose interpolation variable names from nested YAML values.
 */
function collectPlaceholderNamesFromNode(
  value: unknown,
  names: Set<string>,
): void {
  if (typeof value === "string") {
    try {
      for (const variable of extractComposeVariables(value)) {
        names.add(variable.name);
      }
    } catch {
      // Ignore placeholder scan failures for individual strings.
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPlaceholderNamesFromNode(item, names);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectPlaceholderNamesFromNode(nested, names);
    }
  }
}

/**
 * Collects resolved service environment variables from a service definition.
 * @param environment
 * @param serviceEnv
 * @param lookup
 * @returns
 */
function collectResolvedServiceEnvironment(
  environment: unknown,
  serviceEnv: Record<string, string>,
  lookup: Record<string, string>,
): void {
  if (environment === undefined || environment === null) {
    return;
  }

  if (Array.isArray(environment)) {
    for (const entry of environment) {
      if (typeof entry !== "string") {
        continue;
      }

      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }

      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) {
        if (CUSTOM_COMPOSE_ENV_IDENTIFIER_PATTERN.test(trimmed)) {
          const resolved = lookup[trimmed];
          if (resolved !== undefined) {
            serviceEnv[trimmed] = resolved;
          }
        }
        continue;
      }

      const name = trimmed.slice(0, equalsIndex).trim();
      const rawValue = trimmed.slice(equalsIndex + 1).trim();
      if (!CUSTOM_COMPOSE_ENV_IDENTIFIER_PATTERN.test(name)) {
        continue;
      }

      serviceEnv[name] = resolveInlineEnvValue(rawValue, lookup);
    }
    return;
  }

  if (!environment || typeof environment !== "object") {
    return;
  }

  for (const [key, rawValue] of Object.entries(
    environment as Record<string, unknown>,
  )) {
    if (!CUSTOM_COMPOSE_ENV_IDENTIFIER_PATTERN.test(key)) {
      continue;
    }

    if (typeof rawValue === "string") {
      serviceEnv[key] = resolveInlineEnvValue(rawValue, lookup);
      continue;
    }

    if (
      typeof rawValue === "number" ||
      typeof rawValue === "boolean" ||
      typeof rawValue === "bigint"
    ) {
      serviceEnv[key] = String(rawValue);
      continue;
    }

    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    serviceEnv[key] = formatNonStringEnvironmentValue(rawValue);
  }
}
