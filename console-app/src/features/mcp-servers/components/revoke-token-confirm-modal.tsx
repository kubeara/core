import {
  REVOKE_TOKEN_CONFIRM_BUTTON,
  REVOKE_TOKEN_CONFIRM_MESSAGE,
  REVOKE_TOKEN_CONFIRM_TITLE,
} from "../constants/mcp-keys-messages";
import type { McpApiKeyListItem } from "../types";

type RevokeTokenConfirmModalProps = {
  keyItem: McpApiKeyListItem;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RevokeTokenConfirmModal({
  keyItem,
  isPending = false,
  onCancel,
  onConfirm,
}: RevokeTokenConfirmModalProps) {
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
        aria-labelledby="revoke-token-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="revoke-token-confirm-title">{REVOKE_TOKEN_CONFIRM_TITLE}</h2>
          {!isPending ? (
            <button
              type="button"
              className="modal-close"
              aria-label="Close"
              onClick={onCancel}
            >
              ×
            </button>
          ) : null}
        </header>
        <p className="modal-body-text">
          Revoke <strong>{keyItem.name}</strong>? {REVOKE_TOKEN_CONFIRM_MESSAGE}
        </p>
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
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? "Revoking…" : REVOKE_TOKEN_CONFIRM_BUTTON}
          </button>
        </div>
      </div>
    </div>
  );
}
