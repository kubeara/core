import { AUTH_BROADCAST_CHANNEL } from "../constants";

export type AuthBroadcastEvent = "login" | "logout" | "logging_out" | "refresh";

export type SessionLifecycle =
  | "bootstrapping"
  | "authenticated"
  | "unauthenticated"
  | "logging_out";

let lifecycle: SessionLifecycle = "bootstrapping";
let refreshPromise: Promise<boolean> | null = null;
let resetHttpAuthStateHandler: (() => void) | null = null;

const authChangeListeners = new Set<(event: AuthBroadcastEvent) => void>();

function notifyAuthChanges(event: AuthBroadcastEvent): void {
  for (const listener of authChangeListeners) {
    listener(event);
  }
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return null;
  }

  return new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
}

export function getSessionLifecycle(): SessionLifecycle {
  return lifecycle;
}

/** True while auth fetches (/auth/me) are allowed. */
export function isAuthFetchEnabled(): boolean {
  return lifecycle === "bootstrapping" || lifecycle === "authenticated";
}

/** True while silent token refresh is allowed. */
export function isRefreshEnabled(): boolean {
  return lifecycle === "bootstrapping" || lifecycle === "authenticated";
}

export function registerHttpAuthResetHandler(handler: () => void): void {
  resetHttpAuthStateHandler = handler;
}

export function markBootstrapComplete(hasSession: boolean): void {
  lifecycle = hasSession ? "authenticated" : "unauthenticated";
}

export function markSessionAuthenticated(): void {
  lifecycle = "authenticated";
  notifyAuthChanges("login");
  getBroadcastChannel()?.postMessage({ type: "login" });
}

/**
 * Immediately halt auth fetches and refresh attempts.
 * Called at the start of logout before the API request.
 */
export function beginLogout(): void {
  lifecycle = "logging_out";
  refreshPromise = null;
  resetHttpAuthStateHandler?.();
  notifyAuthChanges("logging_out");
}

export function subscribeToAuthChanges(
  onAuthChanged: (event: AuthBroadcastEvent) => void,
): () => void {
  authChangeListeners.add(onAuthChanged);

  const channel = getBroadcastChannel();
  if (!channel) {
    return () => {
      authChangeListeners.delete(onAuthChanged);
    };
  }

  function handleMessage(
    messageEvent: MessageEvent<{ type?: AuthBroadcastEvent }>,
  ): void {
    const event = messageEvent.data?.type;
    if (
      event === "login" ||
      event === "logout" ||
      event === "logging_out" ||
      event === "refresh"
    ) {
      onAuthChanged(event);
    }
  }

  channel.addEventListener("message", handleMessage);

  return () => {
    authChangeListeners.delete(onAuthChanged);
    channel.removeEventListener("message", handleMessage);
    channel.close();
  };
}

/**
 * Refresh the session using the HTTP-only refresh token cookie.
 * Concurrent callers share the same in-flight request.
 */
export async function refreshSession(
  requestRefresh: () => Promise<void>,
): Promise<boolean> {
  if (!isRefreshEnabled()) {
    return false;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    if (!isRefreshEnabled()) {
      return false;
    }

    try {
      await requestRefresh();

      if (!isRefreshEnabled()) {
        return false;
      }

      lifecycle = "authenticated";
      notifyAuthChanges("refresh");
      return true;
    } catch {
      clearSessionState();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function clearSessionState(): void {
  lifecycle = "unauthenticated";
  refreshPromise = null;
  resetHttpAuthStateHandler?.();
  notifyAuthChanges("logout");
  getBroadcastChannel()?.postMessage({ type: "logout" });
}
