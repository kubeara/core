import { useState } from "react";
import {
  useCreateServerMutation,
  useUpdateServerMutation,
} from "@/features/servers/hooks";
import type { Server } from "@/types";
import type { ServerSshAuthType } from "@/features/servers/types";

type ServerFormModalProps = {
  open: boolean;
  mode: "add" | "edit";
  server?: Server | null;
  onClose: () => void;
  onSaved: () => void;
};

type AddFormState = {
  name: string;
  username: string;
  host: string;
  port: string;
  authType: ServerSshAuthType;
  password: string;
  privateKey: string;
};

function getInitialAddForm(): AddFormState {
  return {
    name: "",
    username: "",
    host: "",
    port: "22",
    authType: "PASSWORD",
    password: "",
    privateKey: "",
  };
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
  const [name, setName] = useState(server?.name ?? "");
  const [addForm, setAddForm] = useState<AddFormState>(getInitialAddForm);
  const loading = createMutation.isPending || updateMutation.isPending;
  const isPasswordAuth = addForm.authType === "PASSWORD";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      if (mode === "edit" && server) {
        await updateMutation.mutateAsync({
          id: server.id,
          input: { name: name.trim() },
        });
      } else {
        const port = Number(addForm.port);
        await createMutation.mutateAsync({
          server: {
            name: addForm.name.trim(),
            host: addForm.host.trim(),
            username: addForm.username.trim(),
            ...(Number.isFinite(port) && port > 0 ? { port } : {}),
          },
          ssh: {
            authType: addForm.authType,
            ...(isPasswordAuth
              ? { password: addForm.password }
              : { privateKey: addForm.privateKey }),
          },
          installAgent: true,
        });
      }
      onSaved();
      onClose();
    } catch {
      /* errors surfaced via mutation onError toast */
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
            value={mode === "edit" ? name : addForm.name}
            onChange={(e) =>
              mode === "edit"
                ? setName(e.target.value)
                : setAddForm((prev) => ({ ...prev, name: e.target.value }))
            }
            required
            disabled={loading}
            placeholder="Production API"
          />
        </div>

        {mode === "add" ? (
          <>
            <div className="form-field">
              <label htmlFor="server-username">Username</label>
              <input
                id="server-username"
                value={addForm.username}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, username: e.target.value }))
                }
                required
                disabled={loading}
                placeholder="deploy"
              />
            </div>
            <div className="form-field">
              <label htmlFor="server-host">Host</label>
              <input
                id="server-host"
                value={addForm.host}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, host: e.target.value }))
                }
                required
                disabled={loading}
                placeholder="api.example.com"
              />
            </div>
            <div className="form-field">
              <label htmlFor="server-port">SSH port</label>
              <input
                id="server-port"
                type="number"
                min={1}
                max={65535}
                value={addForm.port}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, port: e.target.value }))
                }
                disabled={loading}
              />
            </div>
            <div className="form-field">
              <label htmlFor="server-auth-type">Authentication</label>
              <select
                id="server-auth-type"
                value={addForm.authType}
                onChange={(e) =>
                  setAddForm((prev) => ({
                    ...prev,
                    authType: e.target.value as ServerSshAuthType,
                  }))
                }
                disabled={loading}
              >
                <option value="PASSWORD">Password</option>
                <option value="PRIVATE_KEY">Private key</option>
              </select>
            </div>
            {isPasswordAuth ? (
              <div className="form-field">
                <label htmlFor="server-password">Password</label>
                <input
                  id="server-password"
                  type="password"
                  value={addForm.password}
                  onChange={(e) =>
                    setAddForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>
            ) : (
              <div className="form-field">
                <label htmlFor="server-private-key">Private key</label>
                <textarea
                  id="server-private-key"
                  value={addForm.privateKey}
                  onChange={(e) =>
                    setAddForm((prev) => ({
                      ...prev,
                      privateKey: e.target.value,
                    }))
                  }
                  required
                  disabled={loading}
                  rows={5}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                />
              </div>
            )}
          </>
        ) : (
          server && (
            <>
              <div className="form-field">
                <label htmlFor="server-username">Username</label>
                <input
                  id="server-username"
                  value={server.username}
                  disabled
                />
              </div>
              <div className="form-field">
                <label htmlFor="server-host">Host</label>
                <input id="server-host" value={server.host} disabled />
              </div>
            </>
          )
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`btn-primary${loading ? " is-loading" : ""}`}
            disabled={loading}
            aria-busy={loading}
          >
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
