import {
  DEPLOYMENT_RESOURCE_WARNING_CONFIRM_BUTTON,
  DEPLOYMENT_RESOURCE_WARNING_CONFIRM_TITLE,
  getDeploymentResourceWarningMessage,
} from "../constants/deployment-validation-messages";
import type { DeploymentResourceWarningCode } from "../types";
import "./deploy-resource-warning-confirm-modal.css";

type DeployResourceWarningConfirmModalProps = {
  title?: string;
  message?: string;
  warningCode?: DeploymentResourceWarningCode;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  dismissLabel?: string;
};

function WarningIcon() {
  return (
    <svg
      className="deploy-resource-warning-warning-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <path
        d="M10 3.2 16.8 15.8H3.2L10 3.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 8.2v3.2M10 13.6h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DeployResourceWarningConfirmModal({
  title,
  message,
  warningCode,
  isPending = false,
  onCancel,
  onConfirm,
  confirmLabel = DEPLOYMENT_RESOURCE_WARNING_CONFIRM_BUTTON,
  dismissLabel = "Cancel",
}: DeployResourceWarningConfirmModalProps) {
  const resolvedTitle =
    title ??
    (warningCode ? DEPLOYMENT_RESOURCE_WARNING_CONFIRM_TITLE : "Warning");
  const resolvedMessage =
    message ??
    (warningCode ? getDeploymentResourceWarningMessage(warningCode) : "");
  const dismissOnly = !onConfirm;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={isPending ? undefined : onCancel}
    >
      <div
        className="modal-dialog deploy-resource-warning-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="deploy-resource-warning-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <WarningIcon />
          <h2 id="deploy-resource-warning-confirm-title">{resolvedTitle}</h2>
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
        <p className="modal-body-text">{resolvedMessage}</p>
        <div className="modal-actions">
          {dismissOnly ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancel}
              disabled={isPending}
            >
              {dismissLabel}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={onCancel}
                disabled={isPending}
              >
                {dismissLabel}
              </button>
              <button
                type="button"
                className={`btn-warning${isPending ? " is-loading" : ""}`}
                onClick={onConfirm}
                disabled={isPending}
                aria-busy={isPending}
              >
                {confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
