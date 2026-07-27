import { apiClient } from "@/api/axios";
import { unwrapServerApiData } from "@/features/servers/utils/server-api-error";
import type { TemplateVariable } from "@/features/templates/types";
import type {
  DeploymentResourceWarning,
  ValidateDeploymentResourcesResult,
} from "../types";

export interface ValidateCustomComposeResult {
  valid: true;
  suggestedTemplateSlug: string;
  variables: TemplateVariable[];
}

export interface ValidateCustomComposeError {
  valid: false;
  issues: Array<{ path: string; message: string }>;
}

export type ValidateCustomComposeResponse =
  ValidateCustomComposeResult | ValidateCustomComposeError;

export interface DeployCustomComposeInput {
  composeYaml: string;
  serverId: string;
  templateSlug: string;
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
 * Validates uploaded Docker Compose YAML and returns extracted variables.
 */
export async function validateCustomComposeUpload(input: {
  composeYaml: string;
  fileName?: string;
}): Promise<ValidateCustomComposeResponse> {
  try {
    const response = await apiClient.post(
      "/deployments/custom-compose/validate",
      {
        composeYaml: input.composeYaml,
        fileName: input.fileName,
      },
    );

    return unwrapServerApiData<ValidateCustomComposeResponse>(
      responseBody(response),
      "Failed to validate compose file",
    );
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Failed to validate compose file");
  }
}

/**
 * Checks agent resources before deploying custom compose.
 */
export async function validateCustomComposeResources(input: {
  composeYaml: string;
  serverId: string;
  templateSlug: string;
  env?: Record<string, string>;
  ports?: Record<string, string>;
}): Promise<ValidateDeploymentResourcesResult> {
  try {
    const response = await apiClient.post(
      "/deployments/custom-compose/resources/check",
      {
        composeYaml: input.composeYaml,
        serverId: input.serverId,
        templateSlug: input.templateSlug,
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
        serverId: input.serverId,
        templateSlug: input.templateSlug,
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
