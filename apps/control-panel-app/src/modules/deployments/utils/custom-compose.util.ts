import type { TemplateVariableDefinition } from "@shared/common";
import * as yaml from "js-yaml";

import { CUSTOM_COMPOSE_MAX_BYTES } from "../constants/custom-compose.constants";
import { parseCustomComposeEnvironmentVariables } from "./custom-compose-env.util";

export interface CustomComposeValidationIssue {
  path: string;
  message: string;
}

export interface CustomComposeValidationSuccess {
  valid: true;
  composeYaml: string;
  /** Auto-generated hint; the user chooses the final templateSlug on configure. */
  suggestedTemplateSlug: string;
  variables: TemplateVariableDefinition[];
}

export interface CustomComposeValidationFailure {
  valid: false;
  issues: CustomComposeValidationIssue[];
}

export type CustomComposeValidationResult =
  CustomComposeValidationSuccess | CustomComposeValidationFailure;

/**
 * Validates uploaded Docker Compose YAML content (not file extension).
 * Accepts standard Docker Compose syntax; does not apply platform template rules
 * such as SERVICE_PORT_*, port_schema, Traefik routing, or header comments.
 * Returns extracted environment variables when validation succeeds.
 */
export function validateUploadedCustomCompose(
  composeYaml: string,
): CustomComposeValidationResult {
  try {
    const trimmed = composeYaml.trim();

    if (!trimmed) {
      return {
        valid: false,
        issues: [{ path: "root", message: "Compose file is empty" }],
      };
    }

    const byteLength = Buffer.byteLength(trimmed, "utf8");
    if (byteLength > CUSTOM_COMPOSE_MAX_BYTES) {
      return {
        valid: false,
        issues: [
          {
            path: "root",
            message: `Compose file exceeds maximum size of ${CUSTOM_COMPOSE_MAX_BYTES} bytes`,
          },
        ],
      };
    }

    const issues = validateCustomComposeStructure(trimmed);
    if (issues.length > 0) {
      return { valid: false, issues };
    }

    let variables: TemplateVariableDefinition[];
    try {
      variables = parseCustomComposeEnvironmentVariables(trimmed);
    } catch (error) {
      return {
        valid: false,
        issues: [
          {
            path: "variables",
            message:
              error instanceof Error
                ? error.message
                : "Failed to extract environment variables from compose file",
          },
        ],
      };
    }

    const serviceSlugs = listCustomComposeServiceSlugs(trimmed);
    if (serviceSlugs.length === 0) {
      return {
        valid: false,
        issues: [
          {
            path: "services",
            message: "Compose file must define at least one service",
          },
        ],
      };
    }

    return {
      valid: true,
      composeYaml: trimmed,
      suggestedTemplateSlug: deriveCustomComposeTemplateSlug(serviceSlugs),
      variables,
    };
  } catch (error) {
    return {
      valid: false,
      issues: [
        {
          path: "root",
          message:
            error instanceof Error
              ? error.message
              : "Failed to validate compose file",
        },
      ],
    };
  }
}

/**
 * Validates structural requirements for user-uploaded Docker Compose files.
 * Checks YAML syntax, a non-empty services map, and that each service defines
 * an image, build, or extends target. Does not enforce Kubeara template rules.
 */
export function validateCustomComposeStructure(
  composeYaml: string,
): CustomComposeValidationIssue[] {
  const issues: CustomComposeValidationIssue[] = [];

  try {
    let parsed: Record<string, unknown>;
    try {
      const loaded = yaml.load(composeYaml);
      if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) {
        issues.push({
          path: "root",
          message: "Compose YAML must resolve to an object",
        });
        return issues;
      }
      parsed = loaded as Record<string, unknown>;
    } catch (error) {
      issues.push({
        path: "root",
        message: `Invalid YAML syntax: ${error instanceof Error ? error.message : String(error)}`,
      });
      return issues;
    }

    const services = parsed.services;
    if (!services || typeof services !== "object" || Array.isArray(services)) {
      issues.push({
        path: "services",
        message: "Compose file must define a non-empty services map",
      });
      return issues;
    }

    const serviceEntries = Object.entries(services);
    if (serviceEntries.length === 0) {
      issues.push({
        path: "services",
        message: "Compose file must define at least one service",
      });
      return issues;
    }

    for (const [serviceName, serviceDefinition] of serviceEntries) {
      try {
        const basePath = `services.${serviceName}`;

        if (
          !serviceDefinition ||
          typeof serviceDefinition !== "object" ||
          Array.isArray(serviceDefinition)
        ) {
          issues.push({
            path: basePath,
            message: "Service definition must be an object",
          });
          continue;
        }

        const service = serviceDefinition as Record<string, unknown>;
        if (!serviceHasRunnableDefinition(service)) {
          issues.push({
            path: basePath,
            message: "Service must define image, build, or extends",
          });
        }
      } catch (error) {
        issues.push({
          path: `services.${serviceName}`,
          message:
            error instanceof Error
              ? error.message
              : "Failed to validate service definition",
        });
      }
    }

    return issues;
  } catch (error) {
    return [
      {
        path: "root",
        message:
          error instanceof Error
            ? error.message
            : "Failed to validate compose structure",
      },
    ];
  }
}

/**
 * Returns sorted service slugs derived from compose service names.
 */
export function listCustomComposeServiceSlugs(composeYaml: string): string[] {
  try {
    const loaded = yaml.load(composeYaml);
    if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) {
      return [];
    }

    return listCustomComposeServiceNames(loaded as Record<string, unknown>)
      .map((serviceName) => sanitizeComposeServiceSlug(serviceName))
      .filter((slug) => slug.length > 0);
  } catch {
    return [];
  }
}

/**
 * Builds the templateSlug for a custom compose deployment from service names.
 * Single service: "app". Multiple: "app-postgres-redis" (sorted, hyphen-joined).
 */
export function deriveCustomComposeTemplateSlug(
  serviceSlugs: string[],
): string {
  try {
    const segments = serviceSlugs
      .map((slug) => slug.trim())
      .filter((slug) => slug.length > 0);

    if (segments.length === 0) {
      throw new Error("Compose file must define at least one service");
    }

    return segments.join("-").slice(0, 255);
  } catch (error) {
    throw new Error(
      `Failed to derive custom compose template slug: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Normalizes a user-provided custom deployment display name.
 */
export function normalizeCustomComposeDisplayName(value: string): string {
  try {
    return value.trim().slice(0, 255);
  } catch (error) {
    throw new Error(
      `Failed to normalize custom compose display name: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Returns a validation error message when a deployment display name is invalid.
 */
export function getCustomComposeDisplayNameValidationError(
  value: string,
): string | null {
  try {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Deployment name is required";
    }

    if (trimmed.length < 2) {
      return "Deployment name must be at least 2 characters";
    }

    if (!/[a-zA-Z0-9]/.test(trimmed)) {
      return "Deployment name must include letters or numbers";
    }

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid deployment name";
  }
}

/**
 * Normalizes a user-provided custom deployment name into a templateSlug value.
 * Preserves letter casing; only trims, hyphenates spaces, and strips invalid characters.
 */
export function normalizeCustomComposeTemplateSlug(value: string): string {
  try {
    const cleaned = value
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-zA-Z0-9-]+/g, "");

    // Avoid /-+/ ReDoS on user input: collapse/trim hyphens in linear time.
    return cleaned
      .split("-")
      .filter((segment) => segment.length > 0)
      .join("-")
      .slice(0, 255);
  } catch (error) {
    throw new Error(
      `Failed to normalize custom compose template slug: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Returns a validation error message when a deployment name is invalid, or null if valid.
 */
export function getCustomComposeTemplateSlugValidationError(
  value: string,
): string | null {
  try {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Deployment name is required";
    }

    const normalized = normalizeCustomComposeTemplateSlug(trimmed);
    if (!normalized) {
      return "Deployment name must include letters or numbers";
    }

    if (normalized.length < 2) {
      return "Deployment name must be at least 2 characters";
    }

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid deployment name";
  }
}

/**
 * Formats a custom compose templateSlug for display in the UI.
 */
export function formatCustomComposeTemplateSlugLabel(
  templateSlug: string,
): string {
  try {
    const trimmed = templateSlug.trim();
    if (!trimmed) {
      return "Custom Compose";
    }

    return trimmed.replace(/-/g, " ");
  } catch {
    return "Custom Compose";
  }
}

/**
 * Returns true when a service defines a runnable source via image, build, or extends.
 */
function serviceHasRunnableDefinition(
  service: Record<string, unknown>,
): boolean {
  try {
    const image = service.image;
    if (typeof image === "string" && image.trim().length > 0) {
      return true;
    }

    const build = service.build;
    if (typeof build === "string" && build.trim().length > 0) {
      return true;
    }
    if (build && typeof build === "object" && !Array.isArray(build)) {
      return true;
    }

    const extendsTarget = service.extends;
    if (typeof extendsTarget === "string" && extendsTarget.trim().length > 0) {
      return true;
    }
    if (
      extendsTarget &&
      typeof extendsTarget === "object" &&
      !Array.isArray(extendsTarget)
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Returns sorted service names from a parsed compose document.
 */
function listCustomComposeServiceNames(
  parsed: Record<string, unknown>,
): string[] {
  try {
    const services = parsed.services;

    if (!services || typeof services !== "object" || Array.isArray(services)) {
      return [];
    }

    return Object.keys(services).sort();
  } catch {
    return [];
  }
}

/**
 * Normalizes a compose service name to a safe slug segment.
 */
function sanitizeComposeServiceSlug(serviceName: string): string {
  try {
    const trimmed = serviceName.trim();
    if (!trimmed) {
      return "";
    }

    const normalized = trimmed.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");

    // Avoid /-+/ ReDoS: trim leading/trailing hyphens in linear time.
    let start = 0;
    let end = normalized.length;
    while (start < end && normalized[start] === "-") {
      start += 1;
    }
    while (end > start && normalized[end - 1] === "-") {
      end -= 1;
    }

    const trimmedHyphens = normalized.slice(start, end);
    return (trimmedHyphens || trimmed).slice(0, 64);
  } catch {
    return "";
  }
}

/**
 * Encodes raw compose YAML into the base64 JSON payload used by deployments.
 */
export function encodeComposeYamlToPayload(composeYaml: string): string {
  try {
    const loaded = yaml.load(composeYaml);
    if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) {
      throw new Error("Compose YAML must resolve to an object");
    }

    const record = loaded as Record<string, unknown>;
    if ("version" in record) {
      delete record.version;
    }

    const json = JSON.stringify(record);
    return Buffer.from(json, "utf8").toString("base64");
  } catch (error) {
    throw new Error(
      `Failed to encode compose YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
