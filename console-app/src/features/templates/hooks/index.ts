import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/query-keys";
import {
  fetchTemplateCategories,
  fetchTemplateDetails,
  fetchTemplates,
} from "../api";
import type { TemplatesListParams } from "../types";

const ALL_TEMPLATES_FETCH_PARAMS: TemplatesListParams = {
  page: 1,
  limit: 100,
};

export function useTemplatesQuery(
  params: TemplatesListParams = ALL_TEMPLATES_FETCH_PARAMS,
  serverId?: string,
) {
  return useQuery({
    queryKey: QUERY_KEYS.templates.list(serverId, params),
    queryFn: () => fetchTemplates(params),
    staleTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

export function useTemplateCategoriesQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.templates.categories(),
    queryFn: fetchTemplateCategories,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTemplateDetailsQuery(slug: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.templates.detail(slug ?? ""),
    queryFn: () => fetchTemplateDetails(slug!),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });
}
