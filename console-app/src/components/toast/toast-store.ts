import type { ToastInput, ToastItem } from "./types";

type ToastListener = (toast: ToastItem) => void;

const listeners = new Set<ToastListener>();

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishToast(input: ToastInput): void {
  const toast: ToastItem = {
    id: crypto.randomUUID(),
    ...input,
  };

  listeners.forEach((listener) => {
    listener(toast);
  });
}
