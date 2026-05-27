import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  useDeleteServerMutation,
  useServersQuery,
} from "@/features/servers/hooks";
import { ServerFormModal } from "./server-form-modal";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { Server, ServerStatus } from "@/types";
import "./servers-table.css";

type SortKey = "name" | "host" | "status" | "createdAt";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [5, 10, 25] as const;
const STATUSES: ServerStatus[] = ["online", "offline", "pending", "error"];

const TABLE_COLUMNS: { key: SortKey; label: string; pill?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "host", label: "Host" },
  { key: "createdAt", label: "Created", pill: true },
  { key: "status", label: "Status" },
];

function compareServers(a: Server, b: Server, key: SortKey, dir: SortDir): number {
  let aVal: string;
  let bVal: string;

  if (key === "createdAt") {
    aVal = a.createdAt;
    bVal = b.createdAt;
  } else {
    aVal = String(a[key]);
    bVal = String(b[key]);
  }

  const result = aVal.localeCompare(bVal, undefined, { sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="9"
        width="13"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

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

function ServerNameCell({ server }: { server: Server }) {
  return (
    <div className="server-name-cell">
      <div className="server-avatar">
        <div className="server-avatar-ring">
          <span className="server-avatar-letter">
            {server.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <span
          className={`server-status-dot ${server.status}`}
          title={server.status}
        />
      </div>
      <div className="server-name-block">
        <Link to={`/servers/${server.id}`} className="server-name-link">
          {server.name}
        </Link>
        <p className="server-name-meta">
          {server.username} · <code>{server.id}</code>
        </p>
      </div>
    </div>
  );
}

function HostCell({ host }: { host: string }) {
  const [copied, setCopied] = useState(false);

  async function copyHost() {
    try {
      await navigator.clipboard.writeText(host);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="server-host-cell">
      <span className="server-host-text">{host}</span>
      <button
        type="button"
        className={`server-copy-btn ${copied ? "copied" : ""}`}
        onClick={copyHost}
        aria-label={copied ? "Copied" : "Copy host"}
        title={copied ? "Copied!" : "Copy host"}
      >
        <CopyIcon />
      </button>
    </div>
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
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  pill?: boolean;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  const content = (
    <>
      <span className="servers-th-label">{label}</span>
      <span className="servers-th-sort-icon">{isActive ? (dir === "asc" ? "▲" : "▼") : "▲"}</span>
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
  const { data: servers = [], isPending: loading } = useServersQuery();
  const deleteMutation = useDeleteServerMutation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return servers.filter((server) => {
      if (statusFilter && server.status !== statusFilter) return false;
      if (!q) return true;
      return (
        server.name.toLowerCase().includes(q) ||
        server.host.toLowerCase().includes(q) ||
        server.username.toLowerCase().includes(q) ||
        server.id.toLowerCase().includes(q)
      );
    });
  }, [servers, search, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => compareServers(a, b, sortKey, sortDir));
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
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

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSettled: () => setDeleteTarget(null),
    });
  }

  const deleting = deleteMutation.isPending;

  const rangeStart = sorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, sorted.length);
  const hasFilters = search.trim() !== "" || statusFilter !== "";

  return (
    <div className="servers-table-wrap">
      <div className="servers-table-toolbar">
        <div className="servers-table-filters">
          <input
            type="search"
            className="servers-search"
            placeholder="Search by name, host, or username…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search servers"
          />
          <select
            className="servers-status-filter"
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              className="servers-filter-clear"
              onClick={clearFilters}
            >
              Clear
            </button>
          )}
        </div>
        <button type="button" className="btn-add-server" onClick={openAdd}>
          + Add server
        </button>
      </div>

      <div className="servers-table-card">
        <div className="servers-table-scroll">
          <table className="servers-table-do">
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
                <th className="servers-th-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="servers-table-empty">
                    Loading servers…
                  </td>
                </tr>
              )}
              {!loading && paginated.length === 0 && (
                <tr>
                  <td colSpan={5} className="servers-table-empty">
                    No servers match your search.
                  </td>
                </tr>
              )}
              {!loading &&
                paginated.map((server) => (
                  <tr key={server.id}>
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
                        title={new Date(server.createdAt).toLocaleString()}
                      >
                        {formatRelativeTime(server.createdAt)}
                      </time>
                    </td>
                    <td>
                      <span className={`server-tag-pill ${server.status}`}>
                        {server.status}
                      </span>
                    </td>
                    <td>
                      <div className="server-row-actions">
                        <button
                          type="button"
                          className="server-action-btn"
                          onClick={() => openEdit(server)}
                          aria-label={`Edit ${server.name}`}
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className="server-action-btn danger"
                          onClick={() => setDeleteTarget(server)}
                          aria-label={`Delete ${server.name}`}
                          title="Delete"
                        >
                          <DeleteIcon />
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
          Showing {rangeStart}–{rangeEnd} of {sorted.length}
          {sorted.length !== servers.length && ` (${servers.length} total)`}
        </div>
        <div className="servers-pagination-controls">
          <label className="servers-page-size">
            Rows
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="servers-page-btn"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="servers-page-indicator">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="servers-page-btn"
            disabled={currentPage >= totalPages}
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
        onSaved={() => { }}
      />

      {deleteTarget && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="modal-dialog modal-dialog-sm"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>Delete server</h2>
            </header>
            <p className="modal-body-text">
              Delete <strong>{deleteTarget.name}</strong> ({deleteTarget.host})?
              This cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
