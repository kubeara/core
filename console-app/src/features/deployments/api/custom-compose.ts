import { apiClient } from "@/api/axios";
import { extractMessageFromBody, toApiError } from "@/api/api-error";
import { unwrapServerApiData } from "@/features/servers/utils/server-api-error";
import type { TemplateVariable } from "@/features/templates/types";
import type {
  DeploymentResourceWarning,
  ValidateDeploymentResourcesResult,
} from "../types";

/** Slug for the internal custom-compose service template (not listed in marketplace). */
export const CUSTOM_TEMPLATE_SLUG = "custom";

export interface CustomComposeServiceEnvironment {
  serviceName: string;
  env: Record<string, string>;
}

export interface ValidateCustomComposeResult {
  valid: true;
  suggestedTemplateSlug: string;
  variables: TemplateVariable[];
  serviceEnvironments: CustomComposeServiceEnvironment[];
}

export interface ValidateCustomComposeError {
  valid: false;
  issues: Array<{ path: string; message: string }>;
}

export type ValidateCustomComposeResponse =
  | ValidateCustomComposeResult
  | ValidateCustomComposeError;

export interface DeployCustomComposeInput {
  composeYaml: string;
  envFileContent?: string;
  serverId: string;
  displayName: string;
  env?: Record<string, string>;
  ports?: Record<string, string>;
  deploymentId?: string;
  acknowledgeResourceWarning?: boolean;
}

export interface DeployCustomComposeResult {
  message: string;
  template: string;
  deploymentId: string;
  serverId: string;
  mode: "custom-compose";
  publicUrl?: string;
}

function responseBody(response: { data: unknown }): Record<string, unknown> {
  try {
    return response.data as Record<string, unknown>;
  } catch {
    return {};
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

const COMPOSE_EXTENSIONS = [".yml", ".yaml"];
const ENV_EXTENSIONS = [".env"];

/**
 * Validates a Docker Compose file name and presence.
 */
export function validateComposeFile(file: File | null): string | null {
  try {
    if (!file) {
      return "Please select a Docker Compose file";
    }

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!COMPOSE_EXTENSIONS.includes(extension)) {
      return "Please upload a .yml or .yaml Docker Compose file";
    }

    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Invalid Docker Compose file";
  }
}

/**
 * Validates an optional environment file name.
 */
export function validateEnvFile(file: File | null): string | null {
  try {
    if (!file) {
      return null;
    }

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ENV_EXTENSIONS.includes(extension) && file.name !== ".env") {
      return "Please upload a .env file";
    }

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid environment file";
  }
}

function parseComposeValidationSummary(
  message: string,
): Array<{ path: string; message: string }> {
  const trimmed = message.trim();
  if (!trimmed) {
    return [{ path: "root", message: "Docker Compose validation failed" }];
  }

  const parts = trimmed.split("; ").filter(Boolean);
  if (parts.length === 0) {
    return [{ path: "root", message: trimmed }];
  }

  return parts.map((part) => {
    const separator = part.indexOf(": ");
    if (separator === -1) {
      return { path: "root", message: part };
    }

    return {
      path: part.slice(0, separator),
      message: part.slice(separator + 2),
    };
  });
}

/**
 * Validates Docker Compose YAML and optional .env content together.
 */
export async function validateCustomComposeUpload(input: {
  composeYaml: string;
  envFileContent?: string;
  fileName?: string;
  skipMissingVariables?: boolean;
}): Promise<ValidateCustomComposeResponse> {
  try {
    const response = await apiClient.post(
      "/deployments/custom-compose/validate",
      {
        composeYaml: input.composeYaml,
        envFileContent: input.envFileContent ?? "",
        fileName: input.fileName,
        skipMissingVariables: input.skipMissingVariables,
      },
    );

    return unwrapServerApiData<ValidateCustomComposeResult>(
      responseBody(response),
      "Failed to validate compose file",
    );
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.status === 400) {
      const message =
        extractMessageFromBody(apiError.body) ??
        apiError.message ??
        "Docker Compose validation failed";
      return {
        valid: false,
        issues: parseComposeValidationSummary(message),
      };
    }

    throw apiError;
  }
}

/**
 * Checks agent resources before deploying custom compose.
 */
export async function validateCustomComposeResources(input: {
  composeYaml: string;
  envFileContent?: string;
  serverId: string;
  displayName: string;
  env?: Record<string, string>;
  ports?: Record<string, string>;
}): Promise<ValidateDeploymentResourcesResult> {
  try {
    const response = await apiClient.post(
      "/deployments/custom-compose/resources/check",
      {
        composeYaml: input.composeYaml,
        envFileContent: input.envFileContent ?? "",
        serverId: input.serverId,
        displayName: input.displayName,
        env: input.env ?? {},
        ports: input.ports ?? {},
      },
    );

    const data = unwrapServerApiData<
      | { available: true }
      | { available: false; warning: DeploymentResourceWarning }
    >(responseBody(response), "Failed to validate deployment resources");

    if (!data.available && data.warning) {
      return { ok: false, warning: data.warning };
    }

    return { ok: true };
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Failed to validate deployment resources");
  }
}

/**
 * Starts a custom Docker Compose deployment on the selected server.
 */
export async function deployCustomCompose(
  input: DeployCustomComposeInput,
): Promise<DeployCustomComposeResult> {
  try {
    const response = await apiClient.post(
      "/deployments/custom-compose",
      {
        composeYaml: input.composeYaml,
        envFileContent: input.envFileContent ?? "",
        serverId: input.serverId,
        displayName: input.displayName,
        env: input.env ?? {},
        ports: input.ports ?? {},
        deploymentId: input.deploymentId,
      },
      input.acknowledgeResourceWarning
        ? { params: { acknowledgeResourceWarning: "true" } }
        : undefined,
    );

    return unwrapServerApiData<DeployCustomComposeResult>(
      responseBody(response),
      "Failed to start deployment",
    );
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Failed to start deployment");
  }
}
