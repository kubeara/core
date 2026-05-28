/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin (e.g. https://api.example.com). Empty = same origin as the SPA. */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
