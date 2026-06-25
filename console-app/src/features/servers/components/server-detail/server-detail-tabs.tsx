import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useServerContainersQuery } from "@/features/deployments/hooks";
import "@/features/templates/templates-ui.css";
import "@/components/server-detail-tabs.css";
import { SERVER_DETAIL_TABS } from "./constants";
import { ServerOverviewTab } from "./tabs/overview-tab";
import { ServerServicesTab } from "./tabs/services-tab";
import { ServerInsightsTab } from "./tabs/insights-tab";
import { ServerActivityTab } from "./tabs/activity-tab";
import { ServerTerminalTab } from "./tabs/terminal-tab";
import { ServerSettingsTab } from "./tabs/settings-tab";
import { getConnectedTemplateIds } from "./utils/container-display";
import {
  parseServerDetailTab,
  SERVER_DETAIL_TAB_SEARCH_PARAM,
} from "./utils/server-detail-tab-url";
import type { ServerDetailTabId, ServerDetailTabsProps } from "./types";

export function ServerDetailTabs({ server }: ServerDetailTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo(
    () => parseServerDetailTab(searchParams.get(SERVER_DETAIL_TAB_SEARCH_PARAM)) ?? "overview",
    [searchParams],
  );

  const setActiveTab = useCallback(
    (tab: ServerDetailTabId) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (tab === "overview") {
            next.delete(SERVER_DETAIL_TAB_SEARCH_PARAM);
          } else {
            next.set(SERVER_DETAIL_TAB_SEARCH_PARAM, tab);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const isOverviewTab = activeTab === "overview";
  const isTerminalTab = activeTab === "terminal";

  const {
    data: overviewContainers = [],
    isLoading: containersLoading,
    isError: containersError,
  } = useServerContainersQuery(server.id, {
    enabled: isOverviewTab,
    poll: isOverviewTab,
  });

  const connectedIds = useMemo(
    () => getConnectedTemplateIds(overviewContainers),
    [overviewContainers],
  );

  return (
    <div className="server-detail-tabs">
      <div
        className="server-detail-tablist"
        role="tablist"
        aria-label="Server sections"
      >
        {SERVER_DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`server-detail-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === "overview" && (
          <ServerOverviewTab
            serverId={server.id}
            serverHost={server.host}
            containers={overviewContainers}
            isLoading={containersLoading}
            isError={containersError}
          />
        )}
        {activeTab === "templates" && (
          <ServerServicesTab
            serverId={server.id}
            connectedIds={connectedIds}
          />
        )}
        {activeTab === "insights" && (
          <ServerInsightsTab serverId={server.id} isActive />
        )}
        {activeTab === "activity" && (
          <ServerActivityTab
            serverId={server.id}
            serverName={server.name}
          />
        )}
        <ServerTerminalTab
          serverId={server.id}
          serverName={server.name}
          serverHost={server.host}
          isVisible={isTerminalTab}
        />
        {activeTab === "settings" && <ServerSettingsTab server={server} />}
      </div>
    </div>
  );
}
