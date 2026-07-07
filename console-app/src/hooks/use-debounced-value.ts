import { useEffect, useState } from "react";

import { waitMs } from "@/lib/async-delay";

/**
 * Returns a debounced copy of the value after the specified delay.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const controller = new AbortController();

    void waitMs(delayMs, controller.signal)
      .then(() => {
        setDebouncedValue(value);
      })
      .catch(() => {});

    return () => {
      controller.abort();
    };
  }, [value, delayMs]);

  return debouncedValue;
}
