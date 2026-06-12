import type { Server } from "@/types";

export type ServerDetailTabId =
  | "overview"
  | "templates"
  | "insights"
  | "activity"
  | "terminal"
  | "settings";

export type ServerDetailTabsProps = {
  server: Server;
};
