import { generateUuid } from "../../lib/uuid";

import type { ToastInput, ToastItem } from "./types";

type ToastListener = (toast: ToastItem) => void;

const listeners = new Set<ToastListener>();
const recentToastKeys = new Map<string, number>();
const TOAST_DEDUPE_MS = 3_000;

function isDuplicateToast(input: ToastInput): boolean {
  const key = `${input.variant}:${input.message}`;
  const now = Date.now();
  const lastShownAt = recentToastKeys.get(key);

  if (lastShownAt !== undefined && now - lastShownAt < TOAST_DEDUPE_MS) {
    return true;
  }

  recentToastKeys.set(key, now);

  for (const [dedupeKey, shownAt] of recentToastKeys) {
    if (now - shownAt >= TOAST_DEDUPE_MS) {
      recentToastKeys.delete(dedupeKey);
    }
  }

  return false;
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishToast(input: ToastInput): void {
  if (isDuplicateToast(input)) {
    return;
  }

  const toast: ToastItem = {
    id: generateUuid(),
    ...input,
  };

  listeners.forEach((listener) => {
    listener(toast);
  });
}
