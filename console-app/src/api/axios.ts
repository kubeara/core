import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { ApiError, extractMessageFromBody } from "@/api/api-error";
import {
  clearSessionState,
  isRefreshEnabled,
  refreshSession,
  registerHttpAuthResetHandler,
} from "@/features/auth/utils/session-manager";
import { shouldSkipRefreshForUrl } from "@/features/auth/constants";
import { getApiBaseUrl } from "@/lib/api-config";

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function rejectEnvelopeFailure(response: AxiosResponse): AxiosResponse {
  const data = response.data;
  if (!isRecord(data) || data.success !== false) {
    return response;
  }

  const status =
    typeof data.statusCode === "number" ? data.statusCode : response.status;
  const message = extractMessageFromBody(data) ?? "Request failed";

  throw new ApiError(message, status, data);
}

export function buildApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalized}` : normalized;
}

export function buildDeploymentsSocketUrl(): string {
  const explicitWs = import.meta.env.VITE_WS_URL?.trim();
  if (explicitWs) {
    return explicitWs.replace(/\/$/, "");
  }

  if (import.meta.env.DEV && typeof window !== "undefined") {
    return `${window.location.origin}/deployments`;
  }

  const base = getApiBaseUrl().replace(/\/api\/?$/, "");
  if (base) {
    return `${base}/deployments`;
  }

  return `${window.location.origin}/deployments`;
}

let isRefreshing = false;
const failedQueue: Array<{
  resolve: () => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown | null): void {
  for (const pending of failedQueue) {
    if (error) {
      pending.reject(error);
    } else {
      pending.resolve();
    }
  }
  failedQueue.length = 0;
}

export function resetHttpAuthState(): void {
  isRefreshing = false;
  processQueue(new Error("Auth session ended"));
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    withCredentials: true,
    headers: {
      "Content-Type": "application/json",
    },
  });

  registerHttpAuthResetHandler(resetHttpAuthState);

  async function requestSessionRefresh(): Promise<void> {
    await client.post("/auth/refresh-token");
  }

  client.interceptors.request.use((config) => {
    const baseURL = getApiBaseUrl();
    if (baseURL) {
      config.baseURL = baseURL;
    }
    config.withCredentials = true;
    return config;
  });

  client.interceptors.response.use(
    (response) => rejectEnvelopeFailure(response),
    async (error: AxiosError) => {
      const originalRequest = error.config as
        | RetriableRequestConfig
        | undefined;

      if (!originalRequest || error.response?.status !== 401) {
        return Promise.reject(error);
      }

      if (!isRefreshEnabled()) {
        return Promise.reject(error);
      }

      if (shouldSkipRefreshForUrl(originalRequest.url)) {
        return Promise.reject(error);
      }

      if (originalRequest._retry) {
        clearSessionState();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        if (!isRefreshEnabled()) {
          return Promise.reject(error);
        }

        return new Promise<void>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          if (!isRefreshEnabled()) {
            return Promise.reject(error);
          }
          return client(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshed = await refreshSession(requestSessionRefresh);
        if (!refreshed || !isRefreshEnabled()) {
          processQueue(error);
          clearSessionState();
          return Promise.reject(error);
        }

        processQueue(null);
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        clearSessionState();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    },
  );

  return client;
}

export const apiClient = createApiClient();
