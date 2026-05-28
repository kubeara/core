type ServerFeedbackMessageProps = {
  variant: "error" | "success";
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ServerFeedbackMessage({
  variant,
  message,
  onRetry,
  retryLabel = "Retry",
}: ServerFeedbackMessageProps) {
  return (
    <div
      className={`form-message ${variant} servers-feedback-message`}
      role={variant === "error" ? "alert" : "status"}
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          className="servers-feedback-retry"
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
