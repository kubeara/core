import {
  CONTAINER_LOGS_STOP_CONFIRM_BUTTON,
  CONTAINER_LOGS_STOP_CONFIRM_MESSAGE,
  CONTAINER_LOGS_STOP_CONFIRM_TITLE,
} from "../constants/container-logs-messages";

type ContainerLogsStopConfirmModalProps = {
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ContainerLogsStopConfirmModal({
  isPending = false,
  onCancel,
  onConfirm,
}: ContainerLogsStopConfirmModalProps) {
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
        aria-labelledby="container-logs-stop-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="container-logs-stop-confirm-title">
            {CONTAINER_LOGS_STOP_CONFIRM_TITLE}
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
        <p className="modal-body-text">{CONTAINER_LOGS_STOP_CONFIRM_MESSAGE}</p>
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
            {isPending ? "Stopping…" : CONTAINER_LOGS_STOP_CONFIRM_BUTTON}
          </button>
        </div>
      </div>
    </div>
  );
}
