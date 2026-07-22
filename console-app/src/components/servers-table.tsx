import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { SensitiveHost } from "@/components/shared/sensitive-host";
import { TooltipHint } from "@/components/ui/tooltip";
import {
  useDeleteServerMutation,
  useServersQuery,
} from "@/features/servers/hooks";
import { ServerFormModal } from "./server-form-modal";
import { FilterClearButton } from "@/components/shared/filter-clear-button";
import { formatApiTimestamp } from "@/lib/unix-timestamp";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  isServerOperationBusy,
  mapServerApiToServer,
  type ServerListSortField,
} from "@/features/servers/types";
import type { Server, ServerOperationStatus } from "@/types";
import { getErrorMessage } from "@/api/api-error";
import {
  SERVER_OPERATION_REMOVING_LABEL,
  SERVER_OPERATION_SETTING_UP_LABEL,
} from "@/features/servers/constants/messages";
import { ServerFeedbackMessage } from "@/features/servers/components/server-feedback-message";
import { ServersTableSkeleton } from "@/components/shared/skeleton";
import { showErrorToast } from "@/lib/toast";
import "./servers-table.css";

type SortDir = "asc" | "desc";

const PAGE_SIZE = 10 as const;
const SEARCH_DEBOUNCE_MS = 300;

const TABLE_COLUMNS: {
  key: ServerListSortField;
  label: string;
  pill?: boolean;
}[] = [
  { key: "name", label: "Name" },
  { key: "host", label: "Host" },
  { key: "createdAt", label: "Created At" },
];

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
/**
 * Returns the operation status label.
 */
function operationStatusLabel(status: ServerOperationStatus): string {
  switch (status) {
    case "starting":
      return SERVER_OPERATION_SETTING_UP_LABEL;
    case "removing":
      return SERVER_OPERATION_REMOVING_LABEL;
    case "error":
      return "Error";
    default:
      return "";
  }
}

/**
 * Server name cell.
 */
function ServerNameCell({ server }: { server: Server }) {
  const busy = isServerOperationBusy(server.operationStatus);
  const statusLabel = server.operationStatus
    ? operationStatusLabel(server.operationStatus)
    : null;
  const statusPillClass =
    server.operationStatus === "starting"
      ? "starting"
      : server.operationStatus === "removing"
        ? "removing"
        : server.operationStatus === "error"
          ? "error"
          : null;
  const statusDotClass =
    server.operationStatus === "removing"
      ? "removing"
      : server.operationStatus === "error"
        ? "error"
        : server.agentConnected
          ? "online"
          : "offline";

  return (
    <div className={`server-name-cell${busy ? " is-busy" : ""}`}>
      <div className="server-avatar">
        <div className="server-avatar-ring">
          <span className="server-avatar-letter">
            {server.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <span
          className={`server-status-dot ${statusDotClass}`}
          aria-hidden
        />
      </div>
      <div className="server-name-block">
        <div className="server-name-row">
          {busy ? (
            <TooltipHint content={server.name}>
              <span className="server-name-link is-disabled tooltip-trigger-wrap--inline">
                {server.name}
              </span>
            </TooltipHint>
          ) : (
            <TooltipHint content={server.name}>
              <Link
                to={`/servers/${server.id}`}
                className="server-name-link tooltip-trigger-wrap--inline"
              >
                {server.name}
              </Link>
            </TooltipHint>
          )}
          {statusLabel && statusPillClass && (
            <span className={`server-tag-pill ${statusPillClass}`}>
              {statusLabel}
            </span>
          )}
        </div>
        <p className="server-name-meta">{server.username}</p>
      </div>
    </div>
  );
}

function HostCell({ host }: { host: string }) {
  return (
    <SensitiveHost
      host={host}
      className="server-host-cell"
      valueClassName="server-host-text"
    />
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  pill,
  onSort,
}: {
  label: string;
  sortKey: ServerListSortField;
  activeKey: ServerListSortField;
  dir: SortDir;
  pill?: boolean;
  onSort: (key: ServerListSortField) => void;
}) {
  const isActive = activeKey === sortKey;
  const content = (
    <>
      <span className="servers-th-label">{label}</span>
      <span className="servers-th-sort-icon">
        {isActive ? (dir === "asc" ? "▲" : "▼") : "▲"}
      </span>
    </>
  );

  if (pill) {
    return (
      <button
        type="button"
        className={`servers-th-sort servers-th-pill ${isActive ? "is-active" : ""}`}
        onClick={() => onSort(sortKey)}
      >
        {content}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`servers-th-sort ${isActive ? "is-active" : ""}`}
      onClick={() => onSort(sortKey)}
    >
      {content}
    </button>
  );
}

export function ServersTable() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [sortKey, setSortKey] = useState<ServerListSortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [removeManagedServices, setRemoveManagedServices] = useState(false);

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch.trim() || undefined,
      sortBy: sortKey,
      sortOrder: sortDir,
    }),
    [page, debouncedSearch, sortKey, sortDir],
  );

  const {
    data: listResponse,
    isPending: loading,
    isFetching,
    isError,
    error,
    refetch,
  } = useServersQuery(listParams);

  const deleteMutation = useDeleteServerMutation();

  const servers = useMemo(
    () => (listResponse?.data ?? []).map(mapServerApiToServer),
    [listResponse?.data],
  );
  /**
   * Ref to track notified operation errors.
   */
  const notifiedOperationErrorsRef = useRef<Set<string>>(new Set());

  /**
   * Effect to show error toast for operation errors.
   */
  useEffect(() => {
    for (const server of servers) {
      if (server.operationStatus !== "error" || !server.operationError) {
        continue;
      }

      const key = `${server.id}:${server.operationError}`;
      if (notifiedOperationErrorsRef.current.has(key)) {
        continue;
      }

      notifiedOperationErrorsRef.current.add(key);
      showErrorToast(server.operationError);
    }
  }, [servers]);

  const pagination = listResponse?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const currentPage = pagination?.page ?? page;

  function handleSort(key: ServerListSortField) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function openAdd() {
    setEditingServer(null);
    setModalOpen(true);
  }

  function openEdit(server: Server) {
    setEditingServer(server);
    setModalOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({
        id: deleteTarget.id,
        removeManagedServices,
      });
      setDeleteTarget(null);
      setRemoveManagedServices(false);
    } catch {
      /* errors surfaced via mutation onError toast */
    }
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteTarget(null);
    setRemoveManagedServices(false);
  }

  const deleting = deleteMutation.isPending;
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total);
  const hasFilters = searchInput.trim() !== "";
  const listErrorMessage = isError ? getErrorMessage(error) : null;
  const emptyMessage = hasFilters
    ? "No servers match your search."
    : "No servers yet. Add your first server to get started.";

  return (
    <div className="servers-table-wrap">
      {listErrorMessage && (
        <ServerFeedbackMessage
          variant="error"
          message={listErrorMessage}
          onRetry={() => {
            void refetch();
          }}
        />
      )}

      <div className="servers-table-toolbar">
        <div className="servers-table-filters">
          <input
            type="text"
            className="servers-search"
            placeholder="Search by name, host, or username…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search servers"
          />
          {hasFilters ? (
            <FilterClearButton onClick={clearFilters} />
          ) : null}
        </div>
        <button type="button" className="btn-add-server" onClick={openAdd}>
          + Add server
        </button>
      </div>

      <div className="servers-table-card">
        <div className="servers-table-scroll">
          <table
            className="servers-table-do"
            aria-busy={loading}
            aria-label={loading ? "Loading servers" : undefined}
          >
            <thead>
              <tr>
                {TABLE_COLUMNS.map(({ key, label, pill }) => (
                  <th key={key}>
                    <SortHeader
                      label={label}
                      sortKey={key}
                      activeKey={sortKey}
                      dir={sortDir}
                      pill={pill}
                      onSort={handleSort}
                    />
                  </th>
                ))}
                <th className="servers-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <ServersTableSkeleton />}
              {!loading && !isError && servers.length === 0 && (
                <tr>
                  <td colSpan={5} className="servers-table-empty">
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {!loading &&
                !isError &&
                servers.map((server) => {
                  const busy = isServerOperationBusy(server.operationStatus);

                  return (
                  <tr key={server.id} className={busy ? "server-row-busy" : undefined}>
                    <td>
                      <ServerNameCell server={server} />
                    </td>
                    <td>
                      <HostCell host={server.host} />
                    </td>
                    <td>
                      <time
                        className="server-created-link"
                        dateTime={server.createdAt}
                      >
                        {formatApiTimestamp(server.createdAt)}
                      </time>
                    </td>
                    <td>
                      <div className="server-row-actions">
                        <TooltipHint content="Edit">
                          <button
                            type="button"
                            className="server-action-btn"
                            onClick={() => openEdit(server)}
                            aria-label={`Edit ${server.name}`}
                            disabled={busy}
                          >
                            <EditIcon />
                          </button>
                        </TooltipHint>
                        <TooltipHint content="Delete">
                          <button
                            type="button"
                            className="server-action-btn danger"
                            onClick={() => setDeleteTarget(server)}
                            aria-label={`Delete ${server.name}`}
                            disabled={busy}
                          >
                            <DeleteIcon />
                          </button>
                        </TooltipHint>
                      </div>
                    </td>
                  </tr>
                  );
                })}
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
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      <ServerFormModal
        open={modalOpen}
        mode={editingServer ? "edit" : "add"}
        server={editingServer}
        onClose={() => {
          setModalOpen(false);
          setEditingServer(null);
        }}
        onSaved={() => {}}
      />

      {deleteTarget && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeDeleteModal}
        >
          <div
            className="modal-dialog delete-server-modal"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>Delete server</h2>
            </header>
            <p className="modal-body-text">
              Delete <strong>{deleteTarget.name}</strong> (
              <SensitiveHost host={deleteTarget.host} monospace={false} />)?
              This cannot be undone.
            </p>
            <label className="delete-server-option">
              <input
                type="checkbox"
                checked={removeManagedServices}
                onChange={(event) =>
                  setRemoveManagedServices(event.target.checked)
                }
                disabled={deleting}
              />
              <span>Remove Kubeara managed services from this server</span>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn-danger${deleting ? " is-loading" : ""}`}
                onClick={() => void confirmDelete()}
                disabled={deleting}
                aria-busy={deleting}
              >
                {deleting ? "Starting removal…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
