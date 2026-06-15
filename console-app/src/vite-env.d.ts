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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __KUBEARA_CONFIG__?: {
    VITE_API_URL?: string;
  };
}
