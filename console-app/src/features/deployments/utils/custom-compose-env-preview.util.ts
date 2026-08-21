import type { CustomComposeServiceEnvironment } from "../api/custom-compose";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const ENV_REFERENCE_PATTERN =
  /^\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[\s\S]*)?\}$/u;

export function isServerMaskedEnvValue(value: string): boolean {
  return /^\*+$/u.test(value);
}

export function stripOptionalEnvQuotes(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function isUnresolvedEnvReference(value: string): boolean {
  return ENV_REFERENCE_PATTERN.test(stripOptionalEnvQuotes(value));
}

function isUsablePreviewValue(value: string | undefined): value is string {
  if (value === undefined || value === "") {
    return false;
  }

  if (isServerMaskedEnvValue(value)) {
    return false;
  }

  return !isUnresolvedEnvReference(value);
}

export function parseDotEnvContent(content: string): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!IDENTIFIER_PATTERN.test(key)) {
      continue;
    }

    variables[key] = stripOptionalEnvQuotes(rawValue);
  }

  return variables;
}

type ServiceComposeEnvironment = {
  keys: Set<string>;
  literals: Record<string, string>;
  rawValues: Record<string, string>;
};

function parseServiceComposeEnvironments(
  composeYaml: string,
): Record<string, ServiceComposeEnvironment> {
  const services: Record<string, ServiceComposeEnvironment> = {};
  const lines = composeYaml.split(/\r?\n/u);
  let currentService: string | null = null;
  let inEnvironment = false;

  for (const line of lines) {
    if (/^\S/u.test(line) && !line.startsWith(" ")) {
      if (line.trim() !== "services:") {
        inEnvironment = false;
        currentService = null;
      }
      continue;
    }

    const serviceMatch = /^ {2}([A-Za-z0-9._-]+):\s*$/u.exec(line);
    if (serviceMatch) {
      currentService = serviceMatch[1];
      services[currentService] ??= {
        keys: new Set(),
        literals: {},
        rawValues: {},
      };
      inEnvironment = false;
      continue;
    }

    if (!currentService) {
      continue;
    }

    if (/^ {4}environment:\s*$/u.test(line)) {
      inEnvironment = true;
      continue;
    }

    if (!inEnvironment) {
      continue;
    }

    if (/^ {4}\S/u.test(line) && !/^ {6}/u.test(line)) {
      inEnvironment = false;
      continue;
    }

    const mappingMatch =
      /^ {6}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*$/u.exec(line);
    if (mappingMatch) {
      const key = mappingMatch[1];
      const rawValue = mappingMatch[2].trim();
      services[currentService].keys.add(key);
      services[currentService].rawValues[key] = rawValue;

      const unquoted = stripOptionalEnvQuotes(rawValue);
      if (!isUnresolvedEnvReference(unquoted)) {
        services[currentService].literals[key] = unquoted;
      }
      continue;
    }

    const arrayEqualsMatch =
      /^ {6}- ([A-Za-z_][A-Za-z0-9_]*)=(.+)\s*$/u.exec(line);
    if (arrayEqualsMatch) {
      const key = arrayEqualsMatch[1];
      const rawValue = stripOptionalEnvQuotes(arrayEqualsMatch[2].trim());
      services[currentService].keys.add(key);
      services[currentService].rawValues[key] = rawValue;

      if (!isUnresolvedEnvReference(rawValue)) {
        services[currentService].literals[key] = rawValue;
      }
      continue;
    }

    const arrayBareMatch = /^ {6}- ([A-Za-z_][A-Za-z0-9_]*)\s*$/u.exec(line);
    if (arrayBareMatch) {
      services[currentService].keys.add(arrayBareMatch[1]);
    }
  }

  return services;
}

function extractComposeEnvironmentLiterals(
  composeYaml: string,
): Record<string, string> {
  const literals: Record<string, string> = {};

  for (const service of Object.values(parseServiceComposeEnvironments(composeYaml))) {
    for (const [key, value] of Object.entries(service.literals)) {
      literals[key] = value;
    }
  }

  return literals;
}

function buildEditorEnvLookup(
  composeYaml: string,
  envFileContent: string,
): Record<string, string> {
  const literals = extractComposeEnvironmentLiterals(composeYaml);
  const dotEnv = parseDotEnvContent(envFileContent);
  const baseLookup = { ...literals, ...dotEnv };

  return Object.fromEntries(
    Object.entries(baseLookup).map(([key, value]) => [
      key,
      resolveEnvReferenceValue(value, baseLookup),
    ]),
  );
}

export function resolveEnvReferenceValue(
  rawValue: string,
  lookup: Record<string, string>,
): string {
  const normalized = stripOptionalEnvQuotes(rawValue.trim());
  const referenceMatch = ENV_REFERENCE_PATTERN.exec(normalized);

  if (referenceMatch) {
    const inner = normalized.slice(2, normalized.length - 1);
    const defaultIndex = inner.indexOf(":-");
    const referenceName =
      defaultIndex === -1 ? inner.trim() : inner.slice(0, defaultIndex).trim();
    const defaultValue =
      defaultIndex === -1 ? undefined : inner.slice(defaultIndex + 2);

    if (lookup[referenceName] !== undefined) {
      return lookup[referenceName];
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    return rawValue;
  }

  if (isServerMaskedEnvValue(normalized)) {
    return normalized;
  }

  return normalized;
}

function resolvePreviewCandidate(
  key: string,
  apiValue: string | undefined,
  composeEnv: ServiceComposeEnvironment | undefined,
  lookup: Record<string, string>,
): string | undefined {
  if (isUsablePreviewValue(apiValue)) {
    return apiValue;
  }

  const literalValue = composeEnv?.literals[key];
  if (literalValue !== undefined) {
    return literalValue;
  }

  const rawComposeValue = composeEnv?.rawValues[key];
  if (rawComposeValue !== undefined) {
    const resolved = resolveEnvReferenceValue(rawComposeValue, lookup);
    if (isUsablePreviewValue(resolved)) {
      return resolved;
    }
  }

  if (lookup[key] !== undefined) {
    return lookup[key];
  }

  if (isServerMaskedEnvValue(apiValue ?? "")) {
    const rawReference = stripOptionalEnvQuotes(rawComposeValue ?? "");
    const referenceName = rawReference.startsWith("${")
      ? rawReference.slice(2, rawReference.indexOf("}"))
      : null;

    if (referenceName && lookup[referenceName] !== undefined) {
      return lookup[referenceName];
    }
  }

  return apiValue;
}

/**
 * Uses resolved API preview values when available and only falls back to editor
 * content for masked or unresolved placeholder values.
 */
export function enrichServiceEnvironmentsFromEditor(
  serviceEnvironments: CustomComposeServiceEnvironment[],
  composeYaml: string,
  envFileContent: string,
): CustomComposeServiceEnvironment[] {
  const lookup = buildEditorEnvLookup(composeYaml, envFileContent);
  const perServiceComposeEnv = parseServiceComposeEnvironments(composeYaml);

  return serviceEnvironments.map((service) => {
    const composeEnv = perServiceComposeEnv[service.serviceName];
    const keys = new Set<string>([
      ...Object.keys(service.env),
      ...(composeEnv ? Array.from(composeEnv.keys) : []),
    ]);
    const mergedEnv: Record<string, string> = {};

    for (const key of keys) {
      const resolved = resolvePreviewCandidate(
        key,
        service.env[key],
        composeEnv,
        lookup,
      );

      if (resolved !== undefined) {
        mergedEnv[key] = resolved;
      }
    }

    return {
      serviceName: service.serviceName,
      env: mergedEnv,
    };
  });
}

function serializeDotEnvValue(value: string): string {
  if (value === "") {
    return "";
  }

  if (/[\s#"']/u.test(value)) {
    return `"${value.replaceAll('"', '\\"')}"`;
  }

  return value;
}

/**
 * Serializes one service environment map to dotenv text for the Step 2 editor.
 * Preserves key insertion order.
 */
export function serializeServiceEnvToDotEnv(
  env: Record<string, string>,
): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${serializeDotEnvValue(value)}`)
    .join("\n");
}

/**
 * Updates a service env map from dotenv editor text while keeping existing keys.
 */
export function applyDotEnvEditorContentToService(
  serviceEnv: Record<string, string>,
  envFileContent: string,
): Record<string, string> {
  const parsed = parseDotEnvContent(envFileContent);
  const next: Record<string, string> = {};

  for (const key of Object.keys(serviceEnv)) {
    next[key] = parsed[key] ?? "";
  }

  return next;
}

/**
 * Builds a single .env payload from per-service environment maps.
 * Later services override duplicate keys so Docker Compose interpolation stays consistent.
 */
export function serializeServiceEnvironmentsToEnvFile(
  serviceEnvironments: CustomComposeServiceEnvironment[],
): string {
  const merged: Record<string, string> = {};

  for (const service of serviceEnvironments) {
    for (const [key, value] of Object.entries(service.env)) {
      if (value.trim() === "" || isUnresolvedEnvReference(value)) {
        continue;
      }

      merged[key] = value;
    }
  }

  return Object.entries(merged)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${serializeDotEnvValue(value)}`)
    .join("\n");
}

/**
 * Upserts .env into a service env map.
 * Compose-derived keys stay first (values overwritten when present in .env);
 * new .env-only keys are appended in .env order.
 */
export function upsertDotEnvIntoService(
  serviceEnv: Record<string, string>,
  envFileContent: string,
): Record<string, string> {
  const parsed = parseDotEnvContent(envFileContent);
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(serviceEnv)) {
    next[key] = parsed[key] !== undefined ? parsed[key] : value;
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (next[key] === undefined) {
      next[key] = value;
    }
  }

  return next;
}

export function normalizeServiceEnvValue(value: string | undefined): string {
  if (value === undefined || value === "") {
    return "";
  }

  if (isUnresolvedEnvReference(value) || isServerMaskedEnvValue(value)) {
    return "";
  }

  return value;
}

/**
 * Keeps previously edited values for services/keys that still exist after compose changes.
 */
export function mergePreservedServiceEnvironments(
  previous: CustomComposeServiceEnvironment[],
  next: CustomComposeServiceEnvironment[],
): CustomComposeServiceEnvironment[] {
  const previousByName = new Map(
    previous.map((service) => [service.serviceName, service.env]),
  );

  return next.map((service) => {
    const previousEnv = previousByName.get(service.serviceName) ?? {};
    const env: Record<string, string> = {};

    for (const [key, value] of Object.entries(service.env)) {
      const preserved = previousEnv[key];
      env[key] = normalizeServiceEnvValue(
        preserved !== undefined ? preserved : value,
      );
    }

    for (const [key, value] of Object.entries(previousEnv)) {
      if (env[key] === undefined) {
        env[key] = normalizeServiceEnvValue(value);
      }
    }

    return {
      serviceName: service.serviceName,
      env,
    };
  });
}

/**
 * Formats a compose environment YAML value for display in the review preview.
 * @param value The value to format.
 * @returns The formatted value.
 */
function formatComposeEnvironmentYamlValue(value: string): string {
  if (value === "") {
    return '""';
  }

  if (/[\s#"':{}[\],&*?|>!%@`]|^\d/u.test(value)) {
    return JSON.stringify(value);
  }

  return value;
}

/**
 * Builds the lines for a service environment block in the review preview.
 * @param env The environment map.
 * @param style The style of the environment block.
 * @returns The lines for the service environment block.
 */
function buildServiceEnvironmentBlockLines(
  env: Record<string, string>,
  style: "mapping" | "array",
): string[] {
  const lines: string[] = ["    environment:"];

  for (const [key, value] of Object.entries(env)) {
    const formatted = formatComposeEnvironmentYamlValue(
      normalizeServiceEnvValue(value),
    );
    if (style === "array") {
      lines.push(`      - ${key}=${formatted}`);
    } else {
      lines.push(`      ${key}: ${formatted}`);
    }
  }

  return lines;
}

/**
 * Injects each service's recorded env map into that service's `environment` block.
 * Preserves mapping vs array style when an environment block already exists.
 */
export function injectServiceEnvironmentsIntoCompose(
  composeYaml: string,
  serviceEnvironments: CustomComposeServiceEnvironment[],
): string {
  let result = composeYaml;

  for (const service of serviceEnvironments) {
    if (Object.keys(service.env).length === 0) {
      continue;
    }

    result = injectOneServiceEnvironment(
      result,
      service.serviceName,
      service.env,
    );
  }

  return result;
}

/**
 * Injects a service environment map into a compose YAML file.
 * @param composeYaml The compose YAML file.
 * @param serviceName The name of the service.
 * @param env The environment map.
 * @returns The injected compose YAML file.
 */
function injectOneServiceEnvironment(
  composeYaml: string,
  serviceName: string,
  env: Record<string, string>,
): string {
  const lines = composeYaml.split(/\r?\n/u);
  const serviceHeader = new RegExp(
    `^ {2}${escapeRegExp(serviceName)}:\\s*$`,
    "u",
  );

  let serviceStart = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (serviceHeader.test(lines[index] ?? "")) {
      serviceStart = index;
      break;
    }
  }

  if (serviceStart === -1) {
    return composeYaml;
  }

  let serviceEnd = lines.length;
  for (let index = serviceStart + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^ {2}\S/u.test(line) || /^\S/u.test(line)) {
      serviceEnd = index;
      break;
    }
  }

  let envStart = -1;
  let envStyle: "mapping" | "array" = "mapping";
  for (let index = serviceStart + 1; index < serviceEnd; index += 1) {
    if (/^ {4}environment:\s*$/u.test(lines[index] ?? "")) {
      envStart = index;
      const nextLine = lines[index + 1] ?? "";
      if (/^ {6}- /u.test(nextLine)) {
        envStyle = "array";
      }
      break;
    }
  }

  let envEnd = envStart === -1 ? -1 : envStart + 1;
  if (envStart !== -1) {
    for (let index = envStart + 1; index < serviceEnd; index += 1) {
      const line = lines[index] ?? "";
      if (/^ {4}\S/u.test(line) && !/^ {6}/u.test(line)) {
        envEnd = index;
        break;
      }
      envEnd = index + 1;
    }
  }

  const blockLines = buildServiceEnvironmentBlockLines(env, envStyle);

  if (envStart !== -1) {
    return [
      ...lines.slice(0, envStart),
      ...blockLines,
      ...lines.slice(envEnd),
    ].join("\n");
  }

  // Insert environment after the service header line.
  return [
    ...lines.slice(0, serviceStart + 1),
    ...blockLines,
    ...lines.slice(serviceStart + 1),
  ].join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const COMPOSE_PLACEHOLDER_PATTERN =
  /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/gu;

/**
 * Substitutes resolved environment values into compose YAML for the review preview,
 * after injecting each service's recorded environment map into its environment block.
 */
export function buildResolvedComposePreview(
  composeYaml: string,
  serviceEnvironments: CustomComposeServiceEnvironment[],
): string {
  const lookup: Record<string, string> = {};

  for (const service of serviceEnvironments) {
    for (const [key, value] of Object.entries(service.env)) {
      const normalized = normalizeServiceEnvValue(value);
      if (normalized !== "") {
        lookup[key] = normalized;
      }
    }
  }

  const injected = injectServiceEnvironmentsIntoCompose(
    composeYaml,
    serviceEnvironments,
  );

  return injected.replace(
    COMPOSE_PLACEHOLDER_PATTERN,
    (
      match,
      bracedName: string | undefined,
      defaultValue: string | undefined,
      dollarName: string | undefined,
    ) => {
      const name = bracedName ?? dollarName;
      if (!name) {
        return match;
      }

      if (lookup[name] !== undefined) {
        return lookup[name];
      }

      if (defaultValue !== undefined) {
        return defaultValue;
      }

      return match;
    },
  );
}
