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
