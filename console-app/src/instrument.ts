import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router";
import * as Sentry from "@sentry/react";

function parseSampleRate(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }

  return parsed;
}

function getTracePropagationTargets(): Array<string | RegExp> {
  const targets: Array<string | RegExp> = ["localhost", /^\//];

  const apiUrl = import.meta.env.VITE_API_URL?.trim();
  if (!apiUrl) {
    return targets;
  }

  try {
    targets.push(new URL(apiUrl).origin);
  } catch {
    // Ignore invalid API URL.
  }

  return targets;
}

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
const sentryDebug = import.meta.env.VITE_SENTRY_DEBUG === "true";

if (dsn) {
  Sentry.init({
    dsn,
    debug: sentryDebug,
    environment:
      import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE?.trim() || undefined,
    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: parseSampleRate(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
      import.meta.env.PROD ? 0.1 : 0,
    ),
    replaysSessionSampleRate: parseSampleRate(
      import.meta.env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
      import.meta.env.PROD ? 0.1 : 0,
    ),
    replaysOnErrorSampleRate: import.meta.env.PROD ? 1 : 0,
    tracePropagationTargets: getTracePropagationTargets(),
  });
}
