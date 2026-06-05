/**
 * Normalize API unix timestamps (seconds or ms) and ISO strings to ISO date strings.
 */
export function unixTimestampToIso(
  value: number | string | null | undefined,
): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "string" && value.includes("T")) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const ms = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  return new Date(ms).toISOString();
}

export function formatTimestamp(
  value: string | null | undefined,
  fallback = "Never",
): string {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) return fallback;

  return date.toLocaleString();
}

/** Format API unix timestamps or ISO strings for display. */
export function formatApiTimestamp(
  value: number | string | null | undefined,
  fallback = "Never",
): string {
  const iso = unixTimestampToIso(value);
  if (!iso) return fallback;
  return formatTimestamp(iso, fallback);
}
