import { unixTimestampToIso } from "@/lib/unix-timestamp";

export function formatRelativeTime(
  value: number | string | null | undefined,
  fallback = "Never",
): string {
  if (value == null || value === "") return fallback;

  const iso =
    typeof value === "string" && value.includes("T")
      ? value
      : unixTimestampToIso(value);

  if (!iso) return fallback;

  const then = new Date(iso).getTime();
  if (Number.isNaN(then) || then <= 0) return fallback;
  const now = Date.now();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin === 1 ? "1 minute ago" : `${diffMin} minutes ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;

  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
}
