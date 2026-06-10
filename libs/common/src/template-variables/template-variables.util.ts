import * as yaml from "js-yaml";

import {
  ComposeVariableRef,
  extractComposeVariables,
} from "../compose-parser/compose-parser.util";

export type TemplateVariableType = "string" | "number" | "boolean";

export interface TemplateVariableDefinition {
  name: string;
  type: TemplateVariableType;
  /** Mirrors {@link hasRequiredOccurrence} for API consumers. */
  required: boolean;
  defaultValue: string | number | boolean | null;
  /** True when ${VAR} without :- appears at least once in compose. */
  hasRequiredOccurrence: boolean;
  /** True when ${VAR:-...} appears at least once in compose. */
  hasDefaultSyntax: boolean;
}

export interface TemplateCommentMetadata {
  documentation?: string;
  slogan?: string;
  shortDescription?: string;
  description?: string;
  longDescription?: string;
  logo?: string;
  category?: string[];
  tags?: string[];
  port?: number;
}

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isServiceUrlFqdnName(name: string): boolean {
  if (!name.startsWith("SERVICE_")) {
    return false;
  }

  const suffix = name.slice("SERVICE_".length);
  if (!suffix.startsWith("URL_") && !suffix.startsWith("FQDN_")) {
    return false;
  }

  const tail = suffix.slice(4);
  return tail.length > 0 && /^[A-Za-z0-9_]+$/.test(tail);
}

function shouldExcludeFromForm(name: string): boolean {
  return isServiceUrlFqdnName(name);
}

function inferVariableType(
  name: string,
  defaultValue: string | undefined,
): TemplateVariableType {
  if (defaultValue === undefined || defaultValue === "") {
    if (name.startsWith("SERVICE_PORT_")) {
      return "number";
    }
    return "string";
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
}

function parseDefaultValue(
  raw: string | undefined,
  type: TemplateVariableType,
): string | number | boolean | null {
  if (raw === undefined || raw === "") {
    return null;
  }

  switch (type) {
    case "boolean":
      return raw.trim().toLowerCase() === "true";
    case "number": {
      const parsed = Number(raw.trim());
      return Number.isNaN(parsed) ? null : parsed;
    }
    default:
      return raw;
  }
}

function mergeComposeVariableRef(
  existing: ComposeVariableRef,
  incoming: ComposeVariableRef,
): void {
  if (incoming.hasDefaultSyntax) {
    existing.hasDefaultSyntax = true;

    if (existing.defaultValue === undefined) {
      existing.defaultValue = incoming.defaultValue;
    } else if (
      existing.defaultValue === "" &&
      incoming.defaultValue !== undefined &&
      incoming.defaultValue !== ""
    ) {
      existing.defaultValue = incoming.defaultValue;
    }
  }

  if (incoming.hasRequiredOccurrence) {
    existing.hasRequiredOccurrence = true;
  }
}

function collectPassthroughEnvironmentNames(composeYaml: string): string[] {
  let parsed: unknown;

  try {
    parsed = yaml.load(composeYaml);
  } catch {
    return [];
  }

  const names = new Set<string>();
  collectPassthroughFromNode(parsed, names);
  return Array.from(names);
}

function collectPassthroughFromNode(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectPassthroughFromNode(item, names);
    }
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "environment") {
      collectPassthroughFromEnvironment(value, names);
    }

    collectPassthroughFromNode(value, names);
  }
}

function collectPassthroughFromEnvironment(
  environment: unknown,
  names: Set<string>,
): void {
  if (Array.isArray(environment)) {
    for (const item of environment) {
      if (typeof item !== "string") {
        continue;
      }

      const trimmed = item.trim();
      if (!trimmed || trimmed.includes("=") || trimmed.includes("$")) {
        continue;
      }

      if (IDENTIFIER_PATTERN.test(trimmed)) {
        names.add(trimmed);
      }
    }
    return;
  }

  if (!environment || typeof environment !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(
    environment as Record<string, unknown>,
  )) {
    if (
      typeof value === "string" &&
      value.trim() === "" &&
      IDENTIFIER_PATTERN.test(key)
    ) {
      names.add(key);
    }
  }
}

function collectYamlStringNodes(composeYaml: string): string[] {
  let parsed: unknown;

  try {
    parsed = yaml.load(composeYaml);
  } catch {
    return [composeYaml];
  }

  const strings: string[] = [];
  walkYamlStrings(parsed, strings);
  return strings;
}

function walkYamlStrings(node: unknown, strings: string[]): void {
  if (typeof node === "string") {
    strings.push(node);
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walkYamlStrings(item, strings);
    }
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    walkYamlStrings(value, strings);
  }
}

function extractVariablesFromYamlStrings(
  composeYaml: string,
): ComposeVariableRef[] {
  const byName = new Map<string, ComposeVariableRef>();

  for (const text of collectYamlStringNodes(composeYaml)) {
    for (const variable of extractComposeVariables(text)) {
      if (!variable.name) {
        continue;
      }

      const existing = byName.get(variable.name);
      if (!existing) {
        byName.set(variable.name, { ...variable });
        continue;
      }

      mergeComposeVariableRef(existing, variable);
    }
  }

  for (const variable of extractComposeVariables(composeYaml)) {
    if (!variable.name) {
      continue;
    }

    const existing = byName.get(variable.name);
    if (!existing) {
      byName.set(variable.name, { ...variable });
      continue;
    }

    mergeComposeVariableRef(existing, variable);
  }

  return Array.from(byName.values());
}

function buildVariableDefinition(
  variable: ComposeVariableRef,
): TemplateVariableDefinition | null {
  const { name, defaultValue } = variable;

  if (shouldExcludeFromForm(name)) {
    return null;
  }

  const hasRequiredOccurrence = Boolean(variable.hasRequiredOccurrence);
  const hasDefaultSyntax = Boolean(variable.hasDefaultSyntax);
  const type = inferVariableType(name, defaultValue);
  const required = hasRequiredOccurrence;
  const parsedDefault = required ? null : parseDefaultValue(defaultValue, type);

  return {
    name,
    type,
    required,
    defaultValue: parsedDefault,
    hasRequiredOccurrence,
    hasDefaultSyntax,
  };
}

/**
 * Parses template metadata from leading YAML comment lines.
 */
export function parseTemplateCommentMetadata(
  composeYaml: string,
): TemplateCommentMetadata {
  const metadata: TemplateCommentMetadata = {};

  for (const line of composeYaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("#")) {
      continue;
    }

    const content = trimmed.slice(1).trim();
    const colonIndex = content.indexOf(":");
    if (colonIndex <= 0) {
      continue;
    }

    const key = content.slice(0, colonIndex).trim().toLowerCase();
    const value = content.slice(colonIndex + 1).trim();

    switch (key) {
      case "documentation":
        metadata.documentation = value;
        break;
      case "shortdescription":
      case "short-description":
        metadata.shortDescription = value;
        break;
      case "description":
        metadata.description = value;
        break;
      case "longdescription":
      case "long-description":
        metadata.longDescription = value;
        break;
      case "slogan":
        metadata.slogan = value;
        break;
      case "category":
        metadata.category = value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        break;
      case "logo":
        metadata.logo = value;
        break;
      case "tags":
        metadata.tags = value
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
        break;
      case "port": {
        const parsedPort = Number(value);
        if (!Number.isNaN(parsedPort)) {
          metadata.port = parsedPort;
        }
        break;
      }
    }
  }

  return metadata;
}

/** Resolves short description from compose comment metadata. */
export function getTemplateDescriptionFromComments(
  metadata: TemplateCommentMetadata,
): string {
  return (
    metadata.shortDescription?.trim() ||
    metadata.description?.trim() ||
    metadata.slogan?.trim() ||
    ""
  );
}

/** Resolves long (HTML) description from compose comment metadata. */
export function getTemplateLongDescriptionFromComments(
  metadata: TemplateCommentMetadata,
): string {
  return metadata.longDescription?.trim() || "";
}

/**
 * Parses deduplicated deployment variables from compose YAML.
 */
export function parseTemplateVariables(
  composeYaml: string,
): TemplateVariableDefinition[] {
  const byName = new Map<string, TemplateVariableDefinition>();

  for (const variable of extractVariablesFromYamlStrings(composeYaml)) {
    const definition = buildVariableDefinition(variable);
    if (definition) {
      byName.set(definition.name, definition);
    }
  }

  for (const name of collectPassthroughEnvironmentNames(composeYaml)) {
    if (byName.has(name)) {
      continue;
    }

    const definition = buildVariableDefinition({
      name,
      hasRequiredOccurrence: true,
    });
    if (definition) {
      byName.set(name, definition);
    }
  }

  return Array.from(byName.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
