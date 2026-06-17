/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin (e.g. https://api.example.com). Empty = same origin as the SPA. */
  readonly VITE_API_URL: string;
  /** Optional explicit Socket.IO URL (e.g. http://localhost:3000/deployments). */
  readonly VITE_WS_URL?: string;
  /** Set to "true" in dev to log deployment socket events in the console. */
  readonly VITE_DEBUG_DEPLOYMENT_SOCKETS?: string;
  /** Microsoft Clarity project ID (from Clarity project settings). */
  readonly VITE_CLARITY_PROJECT_ID?: string;
  /** Sentry DSN for error monitoring (Project Settings → Client Keys). */
  readonly VITE_SENTRY_DSN?: string;
  /** Sentry environment label (defaults to Vite MODE). */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  /** Sentry release identifier (e.g. git SHA). */
  readonly VITE_SENTRY_RELEASE?: string;
  /** Performance trace sample rate between 0 and 1. */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  /** Session replay sample rate between 0 and 1. */
  readonly VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE?: string;
  /** Set to "true" to enable verbose Sentry SDK console logging. */
  readonly VITE_SENTRY_DEBUG?: string;
  readonly VITE_RESEND_OTP_MINUTES?: string;
  readonly VITE_RESEND_OTP_MAX_ATTEMPTS?: string;
  readonly VITE_RESEND_OTP_COOLDOWN_SECONDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __KUBEARA_CONFIG__?: {
    VITE_API_URL?: string;
  };
}
