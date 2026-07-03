import { useMemo, useState } from "react";
import { getErrorMessage, GENERIC_ERROR_MESSAGE } from "@/api/api-error";
import { FilterClearButton } from "@/components/shared/filter-clear-button";
import { McpKeysTableSkeleton } from "@/components/shared/skeleton";
import "@/components/servers-table.css";
import "../mcp-servers.css";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatApiTimestamp } from "@/lib/unix-timestamp";
import {
  useMcpApiKeysQuery,
  useRevokeMcpApiKeyMutation,
} from "../hooks";
import type { McpApiKeyListItem } from "../types";
import { GenerateTokenModal } from "./generate-token-modal";
import { RevokeTokenConfirmModal } from "./revoke-token-confirm-modal";

const PAGE_SIZE = 10 as const;
const SEARCH_DEBOUNCE_MS = 300;

type SortDir = "asc" | "desc";
type McpKeySortField = "name" | "lastUsedAt" | "createdAt" | "revokedAt";

const TABLE_COLUMNS: { key: McpKeySortField; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "lastUsedAt", label: "Last Used" },
  { key: "createdAt", label: "Created At" },
  { key: "revokedAt", label: "Revoked At" },
];

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: McpKeySortField;
  activeKey: McpKeySortField;
  dir: SortDir;
  onSort: (key: McpKeySortField) => void;
}) {
  const isActive = activeKey === sortKey;

  return (
    <button
      type="button"
      className={`servers-th-sort ${isActive ? "is-active" : ""}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="servers-th-label">{label}</span>
      <span className="servers-th-sort-icon">
        {isActive ? (dir === "asc" ? "▲" : "▼") : "▲"}
      </span>
    </button>
  );
}

function sortKeys(
  keys: McpApiKeyListItem[],
  sortKey: McpKeySortField,
  sortDir: SortDir,
): McpApiKeyListItem[] {
  const sorted = [...keys].sort((left, right) => {
    switch (sortKey) {
      case "name":
        return left.name.localeCompare(right.name);
      case "lastUsedAt":
        return (left.lastUsedAt ?? 0) - (right.lastUsedAt ?? 0);
      case "createdAt":
        return left.createdAt - right.createdAt;
      case "revokedAt":
        return (left.revokedAt ?? 0) - (right.revokedAt ?? 0);
      default:
        return 0;
    }
  });

  return sortDir === "asc" ? sorted : sorted.reverse();
}

export function McpKeysSection() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [sortKey, setSortKey] = useState<McpKeySortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<McpApiKeyListItem | null>(
    null,
  );

  const {
    data: keys = [],
    isPending: loading,
    isFetching,
    isError,
    error,
    refetch,
  } = useMcpApiKeysQuery();
  const revokeMutation = useRevokeMcpApiKeyMutation();

  const revoking = revokeMutation.isPending;

  const filteredKeys = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) {
      return keys;
    }

    return keys.filter((key) => key.name.toLowerCase().includes(query));
  }, [debouncedSearch, keys]);

  const sortedKeys = useMemo(
    () => sortKeys(filteredKeys, sortKey, sortDir),
    [filteredKeys, sortKey, sortDir],
  );

  const total = sortedKeys.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total);
  const pageKeys = sortedKeys.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const hasFilters = searchInput.trim() !== "";
  const listErrorMessage = isError ? getErrorMessage(error) : null;
  const emptyMessage = hasFilters
    ? "No tokens match your search."
    : "No tokens yet. Generate one to get started.";

  function handleSort(key: McpKeySortField) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDir(key === "name" ? "asc" : "desc");
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setPage(1);
  }

  async function handleConfirmRevoke() {
    if (!revokeTarget) {
      return;
    }

    try {
      await revokeMutation.mutateAsync(revokeTarget.id);
      setRevokeTarget(null);
    } catch {
      // Error toast shown by mutation hook
    }
  }

  function closeRevokeModal() {
    if (revoking) {
      return;
    }
    setRevokeTarget(null);
  }

  return (
    <div className="servers-table-wrap">
      {listErrorMessage ? (
        <div className="servers-feedback-message" role="alert">
          <span>{listErrorMessage || GENERIC_ERROR_MESSAGE}</span>
          <button
            type="button"
            className="servers-feedback-retry"
            onClick={() => {
              void refetch();
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="servers-table-toolbar">
        <div className="servers-table-filters">
          <input
            type="text"
            className="servers-search"
            placeholder="Search by name…"
            value={searchInput}
            onChange={(event) => handleSearchChange(event.target.value)}
            aria-label="Search tokens"
          />
          {hasFilters ? <FilterClearButton onClick={clearFilters} /> : null}
        </div>
        <button
          type="button"
          className="btn-add-server"
          onClick={() => setIsGenerateModalOpen(true)}
        >
          + Generate Token
        </button>
      </div>

      <div className="servers-table-card">
        <div className="servers-table-scroll">
          <table
            className="servers-table-do"
            aria-busy={loading}
            aria-label={loading ? "Loading tokens" : undefined}
          >
            <thead>
              <tr>
                {TABLE_COLUMNS.map(({ key, label }) => (
                  <th key={key}>
                    <SortHeader
                      label={label}
                      sortKey={key}
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                ))}
                <th className="servers-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <McpKeysTableSkeleton />}
              {!loading && !isError && pageKeys.length === 0 && (
                <tr>
                  <td colSpan={5} className="servers-table-empty">
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {!loading &&
                !isError &&
                pageKeys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td>
                      <span className="server-tag">
                        {formatApiTimestamp(key.lastUsedAt, "Never")}
                      </span>
                    </td>
                    <td>
                      <time
                        className="server-created-link"
                        dateTime={String(key.createdAt)}
                        title={formatApiTimestamp(key.createdAt)}
                      >
                        {formatApiTimestamp(key.createdAt)}
                      </time>
                    </td>
                    <td>
                      <span className="server-tag">
                        {formatApiTimestamp(key.revokedAt, "—")}
                      </span>
                    </td>
                    <td>
                      <div className="server-row-actions">
                        <button
                          type="button"
                          className="mcp-revoke-btn"
                          onClick={() => setRevokeTarget(key)}
                          aria-label={`Revoke ${key.name}`}
                          disabled={revoking || key.status !== "ACTIVE"}
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="servers-pagination">
        <div>
          Showing {rangeStart}–{rangeEnd} of {total}
          {isFetching && !loading ? " · Updating…" : ""}
        </div>
        <div className="servers-pagination-controls">
          <button
            type="button"
            className="servers-page-btn"
            disabled={currentPage <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="servers-page-indicator">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="servers-page-btn"
            disabled={currentPage >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </div>

      <GenerateTokenModal
        open={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
      />

      {revokeTarget ? (
        <RevokeTokenConfirmModal
          keyItem={revokeTarget}
          isPending={revoking}
          onCancel={closeRevokeModal}
          onConfirm={() => {
            void handleConfirmRevoke();
          }}
        />
      ) : null}
    </div>
  );
}
