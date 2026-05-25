/**
 * Base URL for all API requests.
 * Set VITE_API_URL in .env (e.g. https://api.example.com) to point at an external backend.
 * Leave empty for same-origin requests (Vite dev middleware or reverse proxy).
 */
export function getApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_URL?.trim() ?? "";
  return base.replace(/\/$/, "");
}

/** Build a full URL for an API path (always starts with /). */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalized}` : normalized;
}

export type ApiFetchInit = RequestInit & {
  /** When true, skips JSON Content-Type (e.g. for FormData). */
  rawBody?: boolean;
};

/** Fetch wrapper: resolves apiUrl, sends cookies, optional JSON body. */
export async function apiFetch(
  path: string,
  init: ApiFetchInit = {},
): Promise<Response> {
  const { rawBody, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);

  if (
    !rawBody &&
    rest.body !== undefined &&
    !(rest.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(apiUrl(path), {
    ...rest,
    headers,
    credentials: "include",
  });
}
