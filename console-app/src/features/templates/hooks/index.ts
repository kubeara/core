import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/query-keys";
import { fetchTemplateDetails, fetchTemplates } from "../api";

export function useTemplatesQuery(serverId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.templates.list(serverId),
    queryFn: fetchTemplates,
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
