import { useState } from "react";
import {
  useCreateServerMutation,
  useUpdateServerMutation,
} from "@/api/hooks/use-servers";
import { getMutationErrorMessage } from "@/api/hooks/use-auth";
import type { Server, ServerStatus } from "@/lib/types";

const STATUSES: ServerStatus[] = ["online", "offline", "pending", "error"];

type ServerFormModalProps = {
  open: boolean;
  mode: "add" | "edit";
  server?: Server | null;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  name: string;
  username: string;
  host: string;
  status: ServerStatus;
};

function getInitialForm(mode: "add" | "edit", server?: Server | null): FormState {
  if (mode === "edit" && server) {
    return {
      name: server.name,
      username: server.username,
      host: server.host,
      status: server.status,
    };
  }
  return { name: "", username: "", host: "", status: "pending" };
}

function ServerFormContent({
  mode,
  server,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  server?: Server | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const createMutation = useCreateServerMutation();
  const updateMutation = useUpdateServerMutation();
  const initial = getInitialForm(mode, server);
  const [name, setName] = useState(initial.name);
  const [username, setUsername] = useState(initial.username);
  const [host, setHost] = useState(initial.host);
  const [status, setStatus] = useState<ServerStatus>(initial.status);
  const [error, setError] = useState<string | null>(null);

  const loading = createMutation.isPending || updateMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = { name, username, host, status };

    try {
      if (mode === "edit" && server) {
        await updateMutation.mutateAsync({ id: server.id, input: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(getMutationErrorMessage(err, "Failed to save server."));
    }
  }

  return (
    <>
      <header className="modal-header">
        <h2 id="server-modal-title">
          {mode === "add" ? "Add server" : "Edit server"}
        </h2>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </header>
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="form-field">
          <label htmlFor="server-name">Name</label>
          <input
            id="server-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
            placeholder="Production API"
          />
        </div>
        <div className="form-field">
          <label htmlFor="server-username">Username</label>
          <input
            id="server-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={loading}
            placeholder="deploy"
          />
        </div>
        <div className="form-field">
          <label htmlFor="server-host">Host</label>
          <input
            id="server-host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            required
            disabled={loading}
            placeholder="api.example.com"
          />
        </div>
        <div className="form-field">
          <label htmlFor="server-status">Status</label>
          <select
            id="server-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ServerStatus)}
            disabled={loading}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="form-message error">{error}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Saving…" : mode === "add" ? "Add server" : "Save"}
          </button>
        </div>
      </form>
    </>
  );
}

export function ServerFormModal({
  open,
  mode,
  server,
  onClose,
  onSaved,
}: ServerFormModalProps) {
  if (!open) return null;

  const formKey = mode === "edit" && server ? server.id : "new";

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <ServerFormContent
          key={formKey}
          mode={mode}
          server={server}
          onClose={onClose}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
