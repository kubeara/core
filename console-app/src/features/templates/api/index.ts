import { apiClient } from "@/api/axios";
import { unwrapServerApiData } from "@/features/servers/utils/server-api-error";
import type { ApiTemplate } from "../types";

function responseBody(response: { data: unknown }): Record<string, unknown> {
  return response.data as Record<string, unknown>;
}

export async function fetchTemplates(): Promise<ApiTemplate[]> {
  const response = await apiClient.get("/templates");
  return unwrapServerApiData<ApiTemplate[]>(
    responseBody(response),
    "Failed to load templates",
  );
}

export async function fetchTemplateDetails(slug: string): Promise<ApiTemplate> {
  const response = await apiClient.get(`/templates/${encodeURIComponent(slug)}`);
  return unwrapServerApiData<ApiTemplate>(
    responseBody(response),
    "Failed to load template details",
  );
}
