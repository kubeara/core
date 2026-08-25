import { generateUuid } from "../../lib/uuid";

import type { AppErrorInput, AppErrorItem } from "./types";

type AppErrorListener = (errors: AppErrorItem[]) => void;

const listeners = new Set<AppErrorListener>();
const MAX_ERRORS = 20;

let errors: AppErrorItem[] = [];
/** Suppresses republishing a dismissed source until the message changes or clears. */
const dismissedSourceMessages = new Map<string, string>();

function isSourceDismissed(source: string, message: string): boolean {
  return dismissedSourceMessages.get(source) === message;
}

function markSourceDismissed(source: string, message: string): void {
  dismissedSourceMessages.set(source, message);
}

function clearDismissedSource(source: string): void {
  dismissedSourceMessages.delete(source);
}

function emit(): void {
  listeners.forEach((listener) => {
    listener(errors);
  });
}

export function subscribeAppErrors(listener: AppErrorListener): () => void {
  listeners.add(listener);
  listener(errors);

  return () => {
    listeners.delete(listener);
  };
}

export function publishAppError(input: AppErrorInput): void {
  const message = input.message.trim();
  if (!message) {
    return;
  }

  const { source } = input;

  if (source && isSourceDismissed(source, message)) {
    return;
  }

  if (source) {
    const current = errors.find((error) => error.source === source);
    if (current?.message === message) {
      return;
    }
    errors = errors.filter((error) => error.source !== source);
  } else if (errors.some((error) => error.message === message)) {
    // Errors stay visible until dismissed, so repeating the same text adds nothing.
    return;
  }

  errors = [
    ...errors,
    {
      id: generateUuid(),
      message,
      createdAt: Date.now(),
      ...(source ? { source } : {}),
    },
  ].slice(-MAX_ERRORS);
  emit();
}

export function clearAppErrorSource(source: string): void {
  clearDismissedSource(source);
  const next = errors.filter((error) => error.source !== source);
  if (next.length === errors.length) {
    return;
  }

  errors = next;
  emit();
}

export function dismissAppError(id: string): void {
  const target = errors.find((error) => error.id === id);
  if (target?.source) {
    markSourceDismissed(target.source, target.message);
  }

  const next = errors.filter((error) => error.id !== id);
  if (next.length === errors.length) {
    return;
  }

  errors = next;
  emit();
}

export function dismissAllAppErrors(): void {
  if (errors.length === 0) {
    return;
  }

  for (const error of errors) {
    if (error.source) {
      markSourceDismissed(error.source, error.message);
    }
  }

  errors = [];
  emit();
}
