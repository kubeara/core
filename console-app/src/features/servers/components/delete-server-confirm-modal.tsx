import { useState } from "react";
import type { Server } from "@/types";
import "@/components/servers-table.css";

type DeleteServerConfirmModalProps = {
  server: Pick<Server, "name" | "host">;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: (removeManagedServices: boolean) => void;
};

export function DeleteServerConfirmModal({
  server,
  isPending = false,
  onCancel,
  onConfirm,
}: DeleteServerConfirmModalProps) {
  const [removeManagedServices, setRemoveManagedServices] = useState(false);

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={isPending ? undefined : onCancel}
    >
      <div
        className="modal-dialog delete-server-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-server-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="delete-server-confirm-title">Delete server</h2>
        </header>
        <p className="modal-body-text">
          Delete <strong>{server.name}</strong> ({server.host})? This cannot be
          undone.
        </p>
        <label className="delete-server-option">
          <input
            type="checkbox"
            checked={removeManagedServices}
            onChange={(event) =>
              setRemoveManagedServices(event.target.checked)
            }
            disabled={isPending}
          />
          <span>Remove Kubeara managed services from this server</span>
        </label>
        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn-danger${isPending ? " is-loading" : ""}`}
            onClick={() => onConfirm(removeManagedServices)}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? "Starting removal…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
