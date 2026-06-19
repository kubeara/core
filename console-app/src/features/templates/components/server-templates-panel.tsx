import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { Dropdown } from "@/components/shared/dropdown";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useTemplateCategoriesQuery,
  useTemplatesQuery,
} from "../hooks";
import { SkeletonMarketplaceGrid } from "@/components/shared/skeleton";
import { MarketplaceTemplateCard } from "./marketplace-template-card";
import type { ApiTemplate, TemplatesListParams } from "../types";
import "../templates-ui.css";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

type ServerTemplatesPanelProps = {
  serverId: string;
  connectedTemplateSlugs?: Set<string>;
};

export function ServerTemplatesPanel({
  serverId,
  connectedTemplateSlugs = new Set(),
}: ServerTemplatesPanelProps) {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const listParams = useMemo<TemplatesListParams>(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch.trim() || undefined,
      category: category || undefined,
    }),
    [page, debouncedSearch, category],
  );

  const templatesQuery = useTemplatesQuery(listParams, serverId);
  const categoriesQuery = useTemplateCategoriesQuery();

  function handleDeploy(template: ApiTemplate) {
    navigate(`/servers/${serverId}/deploy/${template.slug}`);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function handleCategoryChange(value: string) {
    setCategory(value);
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setCategory("");
    setPage(1);
  }

  const templates = templatesQuery.data?.data ?? [];
  const pagination = templatesQuery.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const currentPage = pagination?.page ?? page;
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total);
  const hasFilters = searchInput.trim() !== "" || category !== "";
  const categories = categoriesQuery.data ?? [];
  const categoryOptions = useMemo(
    () => [
      { value: "", label: "All categories" },
      ...categories.map((entry) => ({ value: entry, label: entry })),
    ],
    [categories],
  );
  const loading = templatesQuery.isPending;
  const fetching = templatesQuery.isFetching;

  if (loading && !templatesQuery.data) {
    return <SkeletonMarketplaceGrid count={6} label="Loading templates…" />;
  }

  if (templatesQuery.isError) {
    return (
      <div className="server-templates-state server-templates-state-error">
        <p className="server-templates-state-title">Unable to load templates</p>
        <p className="server-templates-state-text">
          {getErrorMessage(templatesQuery.error)}
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void templatesQuery.refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  const emptyMessage = hasFilters
    ? "No templates match your search or filters."
    : "There are no deployable templates for this server yet.";

  return (
    <div className="server-templates-panel">
      <div className="server-templates-toolbar">
        <div className="server-templates-filters">
          <input
            type="search"
            className="server-templates-search"
            placeholder="Search by name, slug, or tag…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search templates"
          />
          <Dropdown
            id="server-templates-category"
            className="server-templates-category-dropdown"
            value={category}
            options={categoryOptions}
            onChange={handleCategoryChange}
            disabled={categoriesQuery.isPending}
            ariaLabel="Filter by category"
            searchable
            searchPlaceholder="Search categories…"
            noResultsLabel="No categories found"
            pinnedOptionValue=""
          />
          {hasFilters && (
            <button
              type="button"
              className="filter-clear-btn"
              onClick={clearFilters}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="server-templates-state">
          <p className="server-templates-state-title">No templates found</p>
          <p className="server-templates-state-text">{emptyMessage}</p>
        </div>
      ) : (
        <div
          className="server-templates-grid"
          aria-busy={fetching && !loading ? true : undefined}
        >
          {templates.map((template) => (
            <MarketplaceTemplateCard
              key={template.slug}
              template={template}
              isDeployed={connectedTemplateSlugs.has(template.slug)}
              onDeploy={handleDeploy}
            />
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="server-templates-pagination">
          <div>
            Showing {rangeStart}–{rangeEnd} of {total}
            {fetching && !loading ? " · Updating…" : ""}
          </div>
          <div className="server-templates-pagination-controls">
            <button
              type="button"
              className="server-templates-page-btn"
              disabled={currentPage <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span className="server-templates-page-indicator">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="server-templates-page-btn"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
