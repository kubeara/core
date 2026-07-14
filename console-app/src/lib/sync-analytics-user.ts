import Clarity from "@microsoft/clarity";
import * as Sentry from "@sentry/react";
import type { User } from "@/types";

/** Attach or clear the logged-in user in Sentry and Clarity. */
export function syncAnalyticsUser(user: User | null): void {
  if (!user) {
    if (import.meta.env.VITE_SENTRY_DSN?.trim()) {
      Sentry.setUser(null);
    }
    return;
  }

  if (import.meta.env.VITE_SENTRY_DSN?.trim()) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    });
  }

  if (import.meta.env.VITE_CLARITY_PROJECT_ID?.trim()) {
    Clarity.identify(user.id, undefined, undefined, user.email);
    Clarity.setTag("organizationId", user.organizationId);
  }
}
