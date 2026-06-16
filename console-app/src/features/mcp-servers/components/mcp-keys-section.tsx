import { useState } from "react";
import { getErrorMessage } from "@/api/api-error";
import { McpKeysTableSkeleton } from "@/components/shared/skeleton";
import { formatApiTimestamp } from "@/lib/unix-timestamp";
import {
  useMcpApiKeysQuery,
  useRevokeMcpApiKeyMutation,
} from "../hooks";
import type { McpApiKeyListItem } from "../types";
import { GenerateTokenModal } from "./generate-token-modal";

function StatusBadge({ status }: { status: McpApiKeyListItem["status"] }) {
  const isActive = status === "ACTIVE";
  return (
    <span
      className={`status-pill ${isActive ? "status-online" : "status-offline"}`}
    >
      {isActive ? "Active" : "Revoked"}
    </span>
  );
}

function McpKeysTable({
  keys,
  loading,
  revokingId,
  onRevoke,
}: {
  keys: McpApiKeyListItem[];
  loading: boolean;
  revokingId: string | null;
  onRevoke: (id: string) => void;
}) {
  return (
    <div className="mcp-keys-table-card">
      <table className="mcp-keys-table" aria-busy={loading}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Created</th>
            <th scope="col">Last used</th>
            <th scope="col">Status</th>
            <th scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {loading && <McpKeysTableSkeleton />}
          {!loading && keys.length === 0 && (
            <tr>
              <td colSpan={5} className="mcp-keys-empty">
                No tokens yet. Generate one to get started.
              </td>
            </tr>
          )}
          {!loading &&
            keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>{formatApiTimestamp(key.createdAt, "—")}</td>
                <td>{formatApiTimestamp(key.lastUsedAt, "Never")}</td>
                <td>
                  <StatusBadge status={key.status} />
                </td>
                <td>
                  {key.status === "ACTIVE" ? (
                    <button
                      type="button"
                      className={`btn-danger-outline${revokingId === key.id ? " is-loading" : ""}`}
                      disabled={revokingId !== null}
                      onClick={() => onRevoke(key.id)}
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="mcp-keys-revoked-label">—</span>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function McpKeysSection() {
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const {
    data: keys = [],
    isPending,
    isFetching,
    isError,
    error,
  } = useMcpApiKeysQuery();
  const revokeMutation = useRevokeMcpApiKeyMutation();

  async function handleRevoke(keyId: string) {
    setRevokingId(keyId);
    try {
      await revokeMutation.mutateAsync(keyId);
    } catch {
      // Error toast shown by mutation hook
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="profile-section-card mcp-keys-section">
      <h2>Tokens</h2>

      <div className="mcp-keys-content">
        <div className="mcp-keys-toolbar">
          <p className="mcp-keys-toolbar-desc">
            Generate tokens for AI desktop clients to authenticate with our MCP
            server.
          </p>
          <button
            type="button"
            className="btn-primary mcp-keys-generate-btn"
            onClick={() => setIsGenerateModalOpen(true)}
          >
            Generate Token
          </button>
        </div>

        {isError && (
          <p className="form-field-error" role="alert">
            {getErrorMessage(error)}
          </p>
        )}

        {!isError && (
          <>
            {isFetching && !isPending ? (
              <p className="mcp-keys-updating" aria-live="polite">
                Updating…
              </p>
            ) : null}
            <McpKeysTable
              keys={keys}
              loading={isPending}
              revokingId={revokingId}
              onRevoke={handleRevoke}
            />
          </>
        )}
      </div>

      <GenerateTokenModal
        open={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
      />
    </section>
  );
}
