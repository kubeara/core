import type { ActivityType } from "../../../types/activity";

/**
 * Returns a short icon glyph for an activity type.
 */
export function activityIcon(type: ActivityType): string {
  switch (type) {
    case "deployment":
      return "🚀";
    case "deployment_remove":
      return "🗑";
    case "deployment_validation_stopped":
      return "!";
    case "container_restart":
      return "↻";
    case "container_start":
      return "▶";
    case "container_stop":
      return "■";
    case "container_delete":
      return "✕";
    case "container_logs":
      return "☰";
    case "terminal_opened":
      return ">_";
    case "terminal_disconnected":
      return "■";
    case "server_added":
      return "+";
    case "server_deleted":
      return "−";
    default:
      return "•";
  }
}

/**
 * Maps activity type to a CSS modifier class.
 */
export function activityIconClass(type: ActivityType): string {
  switch (type) {
    case "deployment":
    case "server_added":
      return "activity-icon-deploy";
    case "deployment_remove":
    case "deployment_validation_stopped":
    case "container_delete":
    case "server_deleted":
      return "activity-icon-alert";
    case "container_restart":
    case "container_start":
    case "container_stop":
    case "terminal_opened":
    case "terminal_disconnected":
      return "activity-icon-restart";
    default:
      return "";
  }
}

/**
 * Formats a unix-seconds timestamp for the activity feed.
 */
export function formatActivityTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
