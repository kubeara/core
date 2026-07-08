import { API_ERROR_MESSAGES } from "@/constants/error-messages";

type SentryErrorFallbackProps = {
  error: unknown;
  resetError: () => void;
};

export function SentryErrorFallback({
  resetError,
}: SentryErrorFallbackProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">{API_ERROR_MESSAGES.GENERIC}</p>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={resetError}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
