import type { ServerDetailTabId } from "./types";

export const SERVER_DETAIL_TABS: { id: ServerDetailTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "templates", label: "Services" },
  { id: "insights", label: "Insights" },
  { id: "activity", label: "Activity" },
  { id: "terminal", label: "Terminal" },
  { id: "settings", label: "Settings" },
];
