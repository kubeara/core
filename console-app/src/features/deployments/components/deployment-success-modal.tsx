import "./deployment-success-modal.css";

type DeploymentSuccessModalProps = {
  serverName: string;
  onDismiss: () => void;
  onGoToOverview: () => void;
};

function SuccessIcon() {
  return (
    <svg
      className="deploy-success-modal-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 10.5 8.8 12.8 13.5 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DeploymentSuccessModal({
  serverName,
  onDismiss,
  onGoToOverview,
}: DeploymentSuccessModalProps) {
  return (
    <div
      className="modal-overlay"
      role="presentation"
    >
      <div
        className="modal-dialog deploy-success-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="deploy-success-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <SuccessIcon />
          <h2 id="deploy-success-modal-title">Service deployed successfully</h2>
        </header>
        <p className="modal-body-text">
          Your service is now live on <strong>{serverName}</strong>.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onDismiss}
          >
            Close
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onGoToOverview}
          >
            Go to Overview
          </button>
        </div>
      </div>
    </div>
  );
}
