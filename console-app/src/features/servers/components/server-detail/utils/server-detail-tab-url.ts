import { SERVER_DETAIL_TABS } from "../constants";
import type { ServerDetailTabId } from "../types";

export const SERVER_DETAIL_TAB_SEARCH_PARAM = "tab";

const VALID_TAB_IDS = new Set<string>(
  SERVER_DETAIL_TABS.map((tab) => tab.id),
);

export function parseServerDetailTab(
  value: string | null,
): ServerDetailTabId | null {
  if (!value || !VALID_TAB_IDS.has(value)) {
    return null;
  }
  return value as ServerDetailTabId;
}

export function buildServerDetailHref(
  serverId: string,
  tab: ServerDetailTabId = "overview",
): string {
  const base = `/servers/${serverId}`;
  if (tab === "overview") {
    return base;
  }
  return `${base}?${SERVER_DETAIL_TAB_SEARCH_PARAM}=${tab}`;
}
