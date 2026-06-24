import { useEffect, useState } from "react";
import {
  useCreateServerMutation,
  useUpdateServerMutation,
} from "@/features/servers/hooks";
import type { Server } from "@/types";
import { getErrorMessage } from "@/api/api-error";
import { Dropdown } from "@/components/shared/dropdown";
import { FormErrorsSummary } from "@/components/shared/form-errors-summary";
import { FormFieldLabel } from "@/components/shared/form-field-label";
import { validateRequired } from "@/lib/validation";
import type { ServerSshAuthType } from "@/features/servers/types";

const AUTH_TYPE_OPTIONS: { value: ServerSshAuthType; label: string }[] = [
  { value: "PASSWORD", label: "Password" },
  { value: "PRIVATE_KEY", label: "Private key" },
];

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
    authType: "PRIVATE_KEY",
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const loading = createMutation.isPending || updateMutation.isPending;
  const isPasswordAuth = addForm.authType === "PASSWORD";

  function clearFieldError(field: string) {
    setFormError(null);
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validateForm(): Record<string, string> {
    const errors: Record<string, string> = {};

    if (mode === "edit") {
      const nameError = validateRequired(name, "Name");
      if (nameError) errors.name = nameError;
      return errors;
    }

    const nameError = validateRequired(addForm.name, "Name");
    if (nameError) errors.name = nameError;

    const usernameError = validateRequired(addForm.username, "Username");
    if (usernameError) errors.username = usernameError;

    const hostError = validateRequired(addForm.host, "Host");
    if (hostError) errors.host = hostError;

    if (isPasswordAuth) {
      const passwordError = validateRequired(addForm.password, "Password");
      if (passwordError) errors.password = passwordError;
    } else {
      const privateKeyError = validateRequired(addForm.privateKey, "Private key");
      if (privateKeyError) errors["private-key"] = privateKeyError;
    }

    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

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
    } catch (err) {
      setFormError(getErrorMessage(err));
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
      <form onSubmit={handleSubmit} className="modal-form" noValidate>
        <div className="modal-form-scroll">
          <FormErrorsSummary formError={formError} />
        <div className="form-field">
          <FormFieldLabel htmlFor="server-name" required>
            Name
          </FormFieldLabel>
          <input
            id="server-name"
            value={mode === "edit" ? name : addForm.name}
            onChange={(e) => {
              if (mode === "edit") {
                setName(e.target.value);
              } else {
                setAddForm((prev) => ({ ...prev, name: e.target.value }));
              }
              clearFieldError("name");
            }}
            disabled={loading}
            placeholder="Production API"
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "server-name-error" : undefined}
          />
          {fieldErrors.name && (
            <p
              id="server-name-error"
              className="form-field-error"
              role="alert"
            >
              {fieldErrors.name}
            </p>
          )}
        </div>

        {mode === "add" ? (
          <>
            <div className="form-field">
              <FormFieldLabel htmlFor="server-username" required>
                Username
              </FormFieldLabel>
              <input
                id="server-username"
                value={addForm.username}
                onChange={(e) => {
                  setAddForm((prev) => ({ ...prev, username: e.target.value }));
                  clearFieldError("username");
                }}
                disabled={loading}
                placeholder="deploy"
                aria-invalid={fieldErrors.username ? true : undefined}
                aria-describedby={
                  fieldErrors.username ? "server-username-error" : undefined
                }
              />
              {fieldErrors.username && (
                <p
                  id="server-username-error"
                  className="form-field-error"
                  role="alert"
                >
                  {fieldErrors.username}
                </p>
              )}
            </div>
            <div className="form-field">
              <FormFieldLabel htmlFor="server-host" required>
                Host
              </FormFieldLabel>
              <input
                id="server-host"
                value={addForm.host}
                onChange={(e) => {
                  setAddForm((prev) => ({ ...prev, host: e.target.value }));
                  clearFieldError("host");
                }}
                disabled={loading}  
                placeholder="198.51.100.22"
                aria-invalid={fieldErrors.host ? true : undefined}
                aria-describedby={
                  fieldErrors.host ? "server-host-error" : undefined
                }
              />
              {fieldErrors.host && (
                <p
                  id="server-host-error"
                  className="form-field-error"
                  role="alert"
                >
                  {fieldErrors.host}
                </p>
              )}
            </div>
            <div className="form-field">
              <FormFieldLabel htmlFor="server-auth-type" required>
                Authentication
              </FormFieldLabel>
              <Dropdown
                id="server-auth-type"
                value={addForm.authType}
                options={AUTH_TYPE_OPTIONS}
                onChange={(authType) =>
                  setAddForm((prev) => ({ ...prev, authType }))
                }
                disabled={loading}
                ariaLabel="Authentication"
              />
            </div>
            {isPasswordAuth ? (
              <div className="form-field">
                <FormFieldLabel htmlFor="server-password" required>
                  Password
                </FormFieldLabel>
                <input
                  id="server-password"
                  type="password"
                  value={addForm.password}
                  onChange={(e) => {
                    setAddForm((prev) => ({ ...prev, password: e.target.value }));
                    clearFieldError("password");
                  }}
                  disabled={loading}
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={
                    fieldErrors.password ? "server-password-error" : undefined
                  }
                />
                {fieldErrors.password && (
                  <p
                    id="server-password-error"
                    className="form-field-error"
                    role="alert"
                  >
                    {fieldErrors.password}
                  </p>
                )}
              </div>
            ) : (
              <div className="form-field">
                <FormFieldLabel htmlFor="server-private-key" required>
                  Private key
                </FormFieldLabel>
                <textarea
                  id="server-private-key"
                  className="server-private-key-input"
                  value={addForm.privateKey}
                  onChange={(e) => {
                    setAddForm((prev) => ({
                      ...prev,
                      privateKey: e.target.value,
                    }));
                    clearFieldError("private-key");
                  }}
                  disabled={loading}
                  rows={8}
                  placeholder={
                    "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
                  }
                  spellCheck={false}
                  aria-invalid={fieldErrors["private-key"] ? true : undefined}
                  aria-describedby={
                    fieldErrors["private-key"]
                      ? "server-private-key-error"
                      : undefined
                  }
                />
                {fieldErrors["private-key"] && (
                  <p
                    id="server-private-key-error"
                    className="form-field-error"
                    role="alert"
                  >
                    {fieldErrors["private-key"]}
                  </p>
                )}
              </div>
            )}
            <div className="modal-advanced-section">
              <button
                type="button"
                className="modal-advanced-toggle"
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-expanded={advancedOpen}
              >
                Advanced options
                <svg
                  className={`modal-advanced-chevron${advancedOpen ? " is-open" : ""}`}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {advancedOpen && (
                <div className="modal-advanced-content">
                  <div className="form-field">
                    <FormFieldLabel htmlFor="server-port">
                      Port
                    </FormFieldLabel>
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
                </div>
              )}
            </div>
          </>
        ) : (
          server && (
            <>
              <div className="form-field">
                <FormFieldLabel htmlFor="server-username">Username</FormFieldLabel>
                <input
                  id="server-username"
                  value={server.username}
                  disabled
                />
              </div>
              <div className="form-field">
                <FormFieldLabel htmlFor="server-host">Host</FormFieldLabel>
                <input id="server-host" value={server.host} disabled />
              </div>
            </>
          )
        )}

        </div>

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
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const formKey = mode === "edit" && server ? server.id : "new";

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-server"
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
