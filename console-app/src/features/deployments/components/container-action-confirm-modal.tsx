import {
  CONTAINER_ACTION_CONFIRM_BUTTONS,
  CONTAINER_ACTION_CONFIRM_TITLES,
  CONTAINER_ACTION_PENDING_LABELS,
  getContainerActionConfirmBody,
} from "../constants/container-action-messages";
import type { ContainerActionType } from "../types";

type ContainerActionConfirmModalProps = {
  containerName: string;
  action: ContainerActionType;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * The props for the ContainerActionConfirmModal component.
 */
export function ContainerActionConfirmModal({
  containerName,
  action,
  isPending,
  onCancel,
  onConfirm,
}: ContainerActionConfirmModalProps) {
  const isDelete = action === "delete";
  const confirmButtonClass = isDelete ? "btn-danger" : "btn-primary";

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={isPending ? undefined : onCancel}
    >
      <div
        className="modal-dialog container-action-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="container-action-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="container-action-confirm-title">
            {CONTAINER_ACTION_CONFIRM_TITLES[action]}
          </h2>
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
          {getContainerActionConfirmBody(action, containerName)}
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
            className={`${confirmButtonClass}${isPending ? " is-loading" : ""}`}
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending
              ? CONTAINER_ACTION_PENDING_LABELS[action]
              : CONTAINER_ACTION_CONFIRM_BUTTONS[action]}
          </button>
        </div>
      </div>
    </div>
  );
}
