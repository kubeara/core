/**
 * Waits for the given duration without using setTimeout.
 */
export function waitMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const start = performance.now();
    let rafId = 0;

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cancelAnimationFrame(rafId);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const tick = (now: number) => {
      if (signal?.aborted) {
        onAbort();
        return;
      }

      if (now - start >= ms) {
        cleanup();
        resolve();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  });
}
