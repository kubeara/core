const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Formats a byte count using binary (1024) steps.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals =
    unitIndex === 0 ? 0 : value >= 100 ? 1 : 2;

  return `${value.toFixed(decimals)} ${BYTE_UNITS[unitIndex]}`;
}

/**
 * Formats a percentage with two decimal places.
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00%";
  }

  return `${value.toFixed(2)}%`;
}

/**
 * Formats uptime seconds as days, hours, and minutes.
 */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0 minutes";
  }

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} day${days === 1 ? "" : "s"}`);
  }

  if (hours > 0) {
    parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }

  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  }

  return parts.join(", ");
}

/**
 * Formats load average tuple for display.
 */
export function formatLoadAverage(
  loadAverage: [number, number, number],
): string {
  return loadAverage.map((value) => value.toFixed(2)).join(", ");
}
