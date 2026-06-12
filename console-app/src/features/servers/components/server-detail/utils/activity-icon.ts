import type { ActivityEntry } from "@/lib/server-detail-data";

export function activityIcon(kind: ActivityEntry["kind"]): string {
  switch (kind) {
    case "deploy":
      return "🚀";
    case "restart":
      return "↻";
    case "config":
      return "⚙";
    case "alert":
      return "⚠";
    case "scale":
      return "▲";
    default:
      return "•";
  }
}
