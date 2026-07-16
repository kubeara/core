import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/api/api-error";
import { Dropdown } from "@/components/shared/dropdown";
import { FilterClearButton } from "@/components/shared/filter-clear-button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useTemplateCategoriesQuery,
  useTemplatesQuery,
} from "../hooks";
import { SkeletonMarketplaceGrid } from "@/components/shared/skeleton";
import { MarketplaceTemplateCard } from "./marketplace-template-card";
import {
  buildTemplateCategoryFilterOptions,
  formatCategoryLabel,
} from "../utils/format-template-category";
import type { ApiTemplate, TemplatesListParams } from "../types";
import "../templates-ui.css";

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 300;

type TemplatesMarketplacePanelProps = {
  onDeploy: (template: ApiTemplate) => void;
  serverId?: string;
  connectedTemplateSlugs?: Set<string>;
};

/**
 * Renders the templates marketplace panel.
 * @param onDeploy 
 * @param serverId 
 * @param connectedTemplateSlugs 
 * @returns 
 */
export function TemplatesMarketplacePanel({
  onDeploy,
  serverId,
  connectedTemplateSlugs = new Set(),
}: TemplatesMarketplacePanelProps) {
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

  /**
   * Handles the change of the search input.
   * @param value 
   */
  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  /**
   * Handles the change of the category.
   * @param value 
   */
  function handleCategoryChange(value: string) {
    setCategory(value);
    setPage(1);
  }

  /**
   * Clears the filters.
   */
  function clearFilters() {
    setSearchInput("");
    setCategory("");
    setPage(1);
  }

  const listParamsKey = useMemo(() => JSON.stringify(listParams), [listParams]);
  const [settledParamsKey, setSettledParamsKey] = useState(listParamsKey);

  useEffect(() => {
    if (!templatesQuery.isFetching) {
      setSettledParamsKey(listParamsKey);
    }
  }, [listParamsKey, templatesQuery.isFetching]);

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
    () => buildTemplateCategoryFilterOptions(categories),
    [categories],
  );
  const loading = templatesQuery.isPending;
  const hasLoadedOnce = templatesQuery.data !== undefined;
  const isSearchDebouncing = searchInput.trim() !== debouncedSearch.trim();
  const isFilterLoading =
    hasLoadedOnce &&
    (isSearchDebouncing || listParamsKey !== settledParamsKey);

  if (loading && !templatesQuery.data) {
    return <SkeletonMarketplaceGrid count={6} label="Loading templates…" variant="services" />;
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
    : serverId
      ? "There are no deployable templates for this server yet."
      : "There are no deployable templates yet.";

  return (
    <div
      className={`server-templates-panel${isFilterLoading ? " is-filter-loading" : ""}`}
      aria-busy={isFilterLoading || undefined}
    >
      <div className="server-templates-toolbar">
        <div className="server-templates-filters">
          <input
            type="text"
            className="server-templates-search"
            placeholder="Search by name, slug, or tag…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search templates"
          />
          <div className="server-templates-filter-row">
            <Dropdown
              id="server-templates-category"
              className="server-templates-category-dropdown"
              value={category}
              options={categoryOptions}
              onChange={handleCategoryChange}
              disabled={categoriesQuery.isPending}
              ariaLabel="Filter by category"
              formatLabel={(entry) => (entry ? formatCategoryLabel(entry) : "All")}
              searchable
              searchPlaceholder="Search categories…"
              noResultsLabel="No categories found"
              pinnedOptionValue=""
            />
            {hasFilters ? (
              <FilterClearButton onClick={clearFilters} />
            ) : null}
          </div>
        </div>
      </div>

      {isFilterLoading ? (
        <SkeletonMarketplaceGrid count={12} label="Loading services…" variant="services" />
      ) : templates.length === 0 ? (
        <div className="server-templates-state">
          <p className="server-templates-state-title">No templates found</p>
          <p className="server-templates-state-text">{emptyMessage}</p>
        </div>
      ) : (
        <div className="server-templates-grid">
          {templates.map((template) => (
            <MarketplaceTemplateCard
              key={template.slug}
              template={template}
              isDeployed={connectedTemplateSlugs.has(template.slug)}
              onDeploy={onDeploy}
            />
          ))}
        </div>
      )}

      {total > 0 && !isFilterLoading && (
        <div className="server-templates-pagination">
          <div>
            Showing {rangeStart}–{rangeEnd} of {total}
          </div>
          <div className="server-templates-pagination-controls">
            <button
              type="button"
              className="server-templates-page-btn"
              disabled={currentPage <= 1 || loading || isFilterLoading}
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
              disabled={currentPage >= totalPages || loading || isFilterLoading}
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
