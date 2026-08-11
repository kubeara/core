import { apiClient } from "@/api/axios";
import { unwrapServerApiData } from "@/features/servers/utils/server-api-error";
import type {
  ApiTemplate,
  PaginatedTemplatesResponse,
  TemplatesListParams,
} from "../types";
import { DEFAULT_LOCALE } from "@/constants/default-locale";

function responseBody(response: { data: unknown }): Record<string, unknown> {
  return response.data as Record<string, unknown>;
}


export async function fetchTemplates(
  params: TemplatesListParams = {},
): Promise<PaginatedTemplatesResponse> {
  const response = await apiClient.get("/templates", {
    params: { ...params, locale: DEFAULT_LOCALE },
  });
  return unwrapServerApiData<PaginatedTemplatesResponse>(
    responseBody(response),
    "Failed to load templates",
  );
}

export async function fetchTemplateCategories(): Promise<string[]> {
  const response = await apiClient.get("/templates/categories", {
    params: { locale: DEFAULT_LOCALE },
  });
  return unwrapServerApiData<string[]>(
    responseBody(response),
    "Failed to load template categories",
  );
}

export async function fetchTemplateDetails(slug: string): Promise<ApiTemplate> {
  const response = await apiClient.get(
    `/templates/${encodeURIComponent(slug)}`,
    {
      params: { locale: DEFAULT_LOCALE },
    },
  );
  return unwrapServerApiData<ApiTemplate>(
    responseBody(response),
    "Failed to load template details",
  );
}
