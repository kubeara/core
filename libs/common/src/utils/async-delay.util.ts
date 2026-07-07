import { scheduler } from "node:timers/promises";

/**
 * Waits for the given duration without using setTimeout.
 */
export async function delayMs(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await scheduler.wait(ms, signal ? { signal } : undefined);
}

/**
 * Creates a cancellable delay promise.
 */
export function createCancellableDelay(ms: number): {
  promise: Promise<void>;
  cancel: () => void;
} {
  const controller = new AbortController();
  const promise = delayMs(ms, controller.signal).catch((error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") {
      return new Promise<void>(() => {});
    }
    throw error;
  });

  return {
    promise,
    cancel: () => controller.abort(),
  };
}

/**
 * Creates a promise that rejects after the given duration unless cancelled.
 */
export function createTimeoutRejection(
  ms: number,
  message: string,
): {
  promise: Promise<never>;
  cancel: () => void;
} {
  const controller = new AbortController();
  const promise = delayMs(ms, controller.signal)
    .then(() => {
      throw new Error(message);
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") {
        return new Promise<never>(() => {});
      }
      throw error;
    }) as Promise<never>;

  return {
    promise,
    cancel: () => controller.abort(),
  };
}

/**
 * Races a promise against a timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  const timeout = createTimeoutRejection(timeoutMs, message);

  try {
    return await Promise.race([promise, timeout.promise]);
  } finally {
    timeout.cancel();
  }
}

/**
 * Schedules a callback after the given duration. Returns a cancel function.
 */
export function scheduleTimeoutAction(
  ms: number,
  action: () => void,
): () => void {
  const timeout = createTimeoutRejection(ms, "scheduled-timeout");

  void timeout.promise
    .then(() => {
      action();
    })
    .catch(() => {});

  return timeout.cancel;
}
