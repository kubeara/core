import { getErrorMessage } from "@/api/api-error";
import { useServerResourcesQuery } from "@/features/servers/hooks";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  formatBytes,
  formatLoadAverage,
  formatPercent,
  formatUptime,
} from "@/lib/format-metrics";
import { SkeletonInsightStack } from "@/components/shared/skeleton";
import { InsightMetricCard } from "../insight-metric-card";
import "../insights-tab.css";

type ServerInsightsTabProps = {
  serverId: string;
  isActive: boolean;
};

function InsightsPanelHeader({
  timestamp,
}: {
  timestamp?: string | null;
}) {
  return (
    <header className="insights-panel-header">
      <h2 className="server-detail-section-title">Resource usage</h2>
      <p className="server-detail-section-desc">
        On-demand snapshot for this server. CPU is sampled over one second; network
        totals are cumulative since boot.
        {timestamp ? (
          <>
            {" "}
            Collected{" "}
            <time dateTime={timestamp}>{formatRelativeTime(timestamp)}</time>.
          </>
        ) : null}
      </p>
    </header>
  );
}

export function ServerInsightsTab({ serverId, isActive }: ServerInsightsTabProps) {
  const {
    data: resources,
    isLoading,
    isError,
    error,
    refetch,
  } = useServerResourcesQuery(serverId, {
    enabled: isActive,
  });

  const errorMessage = error ? getErrorMessage(error) : undefined;

  if (isLoading) {
    return (
      <div className="server-detail-panel">
        <InsightsPanelHeader />
        <SkeletonInsightStack count={5} label="Loading server resources…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="server-detail-panel">
        <InsightsPanelHeader />
        <div className="server-templates-state server-templates-state-error">
          <p className="server-templates-state-title">
            Unable to load server resources
          </p>
          <p className="server-templates-state-text">
            {errorMessage ??
              "Could not load resources. Check that this server is online."}
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!resources) {
    return (
      <div className="server-detail-panel">
        <InsightsPanelHeader />
        <p className="server-detail-empty">No resource metrics available.</p>
      </div>
    );
  }

  return (
    <div className="server-detail-panel">
      <InsightsPanelHeader timestamp={resources.timestamp} />

      <div className="insights-grid">
        <InsightMetricCard
          title="CPU"
          value={resources.cpu.usagePercent.toFixed(1)}
          valueUnit="%"
          usagePercent={resources.cpu.usagePercent}
          stats={[
            { label: "Usage", value: formatPercent(resources.cpu.usagePercent) },
            { label: "Cores", value: resources.cpu.cores },
            {
              label: "Load average",
              value: formatLoadAverage(resources.cpu.loadAverage),
            },
          ]}
        />

        <InsightMetricCard
          title="Memory"
          value={resources.memory.usagePercent.toFixed(1)}
          valueUnit="%"
          usagePercent={resources.memory.usagePercent}
          stats={[
            { label: "Total", value: formatBytes(resources.memory.total) },
            { label: "Used", value: formatBytes(resources.memory.used) },
            { label: "Free", value: formatBytes(resources.memory.free) },
            { label: "Usage", value: formatPercent(resources.memory.usagePercent) },
          ]}
        />

        <InsightMetricCard
          title="Disk"
          value={resources.disk.usagePercent.toFixed(1)}
          valueUnit="%"
          usagePercent={resources.disk.usagePercent}
          stats={[
            { label: "Total", value: formatBytes(resources.disk.total) },
            { label: "Used", value: formatBytes(resources.disk.used) },
            { label: "Free", value: formatBytes(resources.disk.free) },
            { label: "Usage", value: formatPercent(resources.disk.usagePercent) },
          ]}
        />

        <InsightMetricCard
          title="Network"
          value={formatBytes(resources.network.rxBytes)}
          valueUnit="total RX"
          stats={[
            {
              label: "RX (since boot)",
              value: formatBytes(resources.network.rxBytes),
            },
            {
              label: "TX (since boot)",
              value: formatBytes(resources.network.txBytes),
            },
          ]}
        />

        <InsightMetricCard
          title="System"
          value={formatUptime(resources.system.uptime)}
          stats={[
            { label: "Uptime", value: formatUptime(resources.system.uptime) },
            {
              label: "Hostname",
              value: <code>{resources.system.hostname}</code>,
            },
            { label: "Platform", value: resources.system.platform },
            { label: "Architecture", value: resources.system.architecture },
          ]}
        />
      </div>
    </div>
  );
}
