import { useEffect, useMemo, useState } from "react";
import { useDisconnectServerMutation } from "@/features/servers/hooks";
import { useServerContainersQuery } from "@/features/deployments/hooks";
import type { ServerContainer } from "@/features/deployments/types";
import { ServerTemplatesPanel } from "@/features/templates/components/server-templates-panel";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { formatApiTimestamp } from "@/lib/unix-timestamp";
import {
  getServerActivity,
  getServerInsights,
  type ActivityEntry,
} from "@/lib/server-detail-data";
import { SkeletonGrid } from "@/components/shared/skeleton";
import { Switch } from "@/components/ui/switch";
import type { Server } from "@/types";
import "@/features/templates/templates-ui.css";
import "./server-detail-tabs.css";
import { ContainerStatus } from "@/enums/container-status.enum";

type TabId = "overview" | "templates" | "insights" | "activity" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "templates", label: "Services" },
  { id: "insights", label: "Insights" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

type ServerDetailTabsProps = {
  server: Server;
};

function activityIcon(kind: ActivityEntry["kind"]): string {
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

function InsightChart({ points }: { points: number[] }) {
  const max = Math.max(...points, 1);
  return (
    <div className="insight-chart" role="img" aria-hidden>
      {points.map((value, i) => (
        <div
          key={i}
          className="insight-bar"
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function managedTypeLabel(managedType: ServerContainer["managedType"]): string {
  return managedType === "KUBEARA_MANAGED" ? "Kubeara Managed" : "Self Managed";
}

function containerStatusClass(container: ServerContainer): string {
  if (!container.isOnline) {
    return ContainerStatus.OFFLINE;
  }
  const normalized = container.status.toLowerCase();
  if (normalized.includes("up") || normalized.includes("running")) {
    return ContainerStatus.RUNNING;
  }
  if (normalized.includes("exited") || normalized.includes("stopped")) {
    return ContainerStatus.STOPPED;
  }
  return ContainerStatus.DEGRADED;
}

function ConnectedServiceCard({ container }: { container: ServerContainer }) {
  const statusClass = containerStatusClass(container);

  const displayName =
    container.containerName || container.templateId || "Container";

  const cleanName = displayName.replace(/^deployment-\d+-[^-]+-/, "");

  const iconLetter = (cleanName || displayName).charAt(0).toUpperCase();

  const statusLabel = container.isOnline ? container.status : "Offline";
  const portsDisplay = container.ports?.match(/:(\d+)->/)?.[1] ?? "N/A";
  const subtitle = container.templateId ?? container.containerName;

  return (
    <article
      className={`marketplace-card overview-container-card${!container.isOnline ? " marketplace-card-offline" : ""}`}
    >
      <div className="marketplace-card-header">
        <div className="marketplace-card-icon" aria-hidden>
          {iconLetter}
        </div>
        <div className="marketplace-card-headline">
          <p className="marketplace-card-category">
            {managedTypeLabel(container.managedType)}
          </p>
          <h3 className="marketplace-card-name" title={displayName}>
            {cleanName}
            {!container.isOnline ? (
              <span className="marketplace-card-status-badge is-offline">
                Offline
              </span>
            ) : container.managedType === "KUBEARA_MANAGED" ? (
              <span className="marketplace-card-deployed-badge">Deployed</span>
            ) : null}
          </h3>
          {subtitle ? (
            <p className="marketplace-card-slug">
              <code>{subtitle}</code>
            </p>
          ) : null}
        </div>
      </div>

      <div className="marketplace-card-body">
        {container.imageName ? (
          <p className="marketplace-card-description" title={container.imageName}>
            {container.imageName}
          </p>
        ) : (
          <p className="marketplace-card-description marketplace-card-description-empty">
            No image information available.
          </p>
        )}

        <dl className="marketplace-card-meta">
          <div className="marketplace-card-meta-item">
            <dt>Status</dt>
            <dd>
              <span className={`service-status service-status-${statusClass}`}>
                {statusLabel}
              </span>
            </dd>
          </div>
          <div className="marketplace-card-meta-item">
            <dt>Ports</dt>
            <dd>
              <code title={container.ports || undefined}>{portsDisplay}</code>
            </dd>
          </div>
          {container.runningSince ? (
            <div className="marketplace-card-meta-item">
              <dt>Running</dt>
              <dd>{container.runningSince}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </article>
  );
}

function OverviewTab({ serverId }: { serverId: string }) {
  const { data: containers = [], isLoading, isError } =
    useServerContainersQuery(serverId);

  const kubearaManagedContainers = containers.filter(
    (container) => container.managedType === "KUBEARA_MANAGED",
  );

  const selfManagedContainers = containers.filter(
    (container) => container.managedType !== "KUBEARA_MANAGED",
  );

  return (
    <div className="server-detail-panel">
      <h2 className="server-detail-section-title">Connected services</h2>

      <p className="server-detail-section-desc">
        Containers discovered on this server, including Kubeara deployments and
        self-managed workloads.
      </p>

      {isLoading ? (
        <SkeletonGrid count={3} cardHeight={200} label="Loading containers…" />
      ) : isError ? (
        <p className="server-detail-empty">
          Could not load containers. Ensure the agent is connected.
        </p>
      ) : containers.length === 0 ? (
        <p className="server-detail-empty">No services connected yet.</p>
      ) : (
        <>
          <div className="server-templates-grid">
            {kubearaManagedContainers.map((container) => (
              <ConnectedServiceCard
                key={
                  container.containerId ??
                  `${container.deploymentId ?? "offline"}-${container.containerName}`
                }
                container={container}
              />
            ))}
          </div>

          {selfManagedContainers.length > 0 && (
            <>
              <h3 className="connected-services-section-title">
                Self Managed
              </h3>

              <div className="server-templates-grid">
                {selfManagedContainers.map((container) => (
                  <ConnectedServiceCard
                    key={
                      container.containerId ??
                      `${container.deploymentId ?? "offline"}-${container.containerName}`
                    }
                    container={container}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function TemplatesTab({
  serverId,
  connectedIds,
}: {
  serverId: string;
  connectedIds: Set<string>;
}) {
  return (
    <div className="server-detail-panel server-detail-templates">
      <h2 className="server-detail-section-title">Deploy a template</h2>
      <p className="server-detail-section-desc">
        Browse the marketplace and deploy services directly to this server.
      </p>
      <ServerTemplatesPanel
        serverId={serverId}
        connectedTemplateSlugs={connectedIds}
      />
    </div>
  );
}

function InsightsTab({ serverId }: { serverId: string }) {
  const insights = useMemo(() => getServerInsights(serverId), [serverId]);
  const metrics = [insights.bandwidth, insights.cpu, insights.diskIo];

  return (
    <div className="server-detail-panel">
      <h2 className="server-detail-section-title">Resource usage</h2>
      <p className="server-detail-section-desc">
        Live metrics for the last 24 hours (sampled).
      </p>
      <div className="insights-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="insight-card">
            <div className="insight-card-header">
              <h3>{metric.label}</h3>
              <div className="insight-value">
                {metric.value}
                <span>{metric.unit}</span>
              </div>
            </div>
            <p className="insight-peak">Peak: {metric.peak} {metric.unit}</p>
            <InsightChart points={metric.points} />
          </article>
        ))}
      </div>
    </div>
  );
}

function ActivityTab({
  serverId,
  serverName,
}: {
  serverId: string;
  serverName: string;
}) {
  const activity = useMemo(
    () => getServerActivity(serverId, serverName),
    [serverId, serverName],
  );

  return (
    <div className="server-detail-panel">
      <h2 className="server-detail-section-title">Recent activity</h2>
      <p className="server-detail-section-desc">
        Deployments, configuration changes, and alerts for this server.
      </p>
      <div className="activity-feed">
        {activity.map((entry) => (
          <div key={entry.id} className="activity-item">
            <span
              className={`activity-icon activity-icon-${entry.kind}`}
              aria-hidden
            >
              {activityIcon(entry.kind)}
            </span>
            <div className="activity-body">
              <strong>{entry.title}</strong>
              <p>{entry.detail}</p>
            </div>
            <time className="activity-time" dateTime={entry.timestamp}>
              {formatRelativeTime(entry.timestamp)}
            </time>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsTab({ server }: { server: Server }) {
  const disconnectMutation = useDisconnectServerMutation();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [monitoringEnabled, setMonitoringEnabled] = useState(server.connected);

  useEffect(() => {
    setMonitoringEnabled(server.connected);
  }, [server.connected]);

  async function handleDisconnect() {
    try {
      await disconnectMutation.mutateAsync(server.id);
      setDisconnectOpen(false);
    } catch {
      /* errors surfaced via mutation onError toast */
    }
  }

  function openDisconnectModal() {
    setDisconnectOpen(true);
  }

  function closeDisconnectModal() {
    if (disconnecting) return;
    setDisconnectOpen(false);
  }

  const disconnecting = disconnectMutation.isPending;

  return (
    <div className="server-detail-panel">
      <section className="settings-section">
        <h2>Server configuration</h2>
        <dl className="server-detail-grid">
          <div>
            <dt>Name</dt>
            <dd>{server.name}</dd>
          </div>
          <div>
            <dt>Host</dt>
            <dd>
              <code>{server.host}</code>
            </dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{server.username}</dd>
          </div>
          <div>
            <dt>Created At</dt>
            <dd>
              <time dateTime={server.createdAt ?? undefined}>
                {formatApiTimestamp(server.createdAt)}
              </time>
            </dd>
          </div>
        </dl>

        <div className="settings-toggles">
          <div className="settings-toggle-row">
            <div>
              <span className="settings-toggle-label">Monitoring</span>
              <span className="settings-toggle-hint">
                Collect metrics and send alerts to your workspace
              </span>
            </div>
            <Switch
              checked={monitoringEnabled}
              onCheckedChange={setMonitoringEnabled}
              aria-label="Monitoring"
            />
          </div>
        </div>
      </section>

      <section className="settings-danger-zone">
        <h2>Disconnect server</h2>
        <p>
          Disconnect this server from Kubeara. Services on the server will not
          be removed.
        </p>
        <button
          type="button"
          className="btn-danger-outline"
          onClick={openDisconnectModal}
        >
          Disconnect server
        </button>
      </section>

      {disconnectOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disconnect-server-title"
        >
          <div className="modal-dialog modal-dialog-sm">
            <div className="modal-header">
              <h2 id="disconnect-server-title">Disconnect server?</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={closeDisconnectModal}
              >
                ×
              </button>
            </div>
            <p className="modal-body-text">
              <strong>{server.name}</strong> ({server.host}) will be
              disconnected from Kubeara. You can reconnect it later.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={disconnecting}
                onClick={closeDisconnectModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn-danger-outline${disconnecting ? " is-loading" : ""}`}
                disabled={disconnecting}
                aria-busy={disconnecting}
                onClick={() => void handleDisconnect()}
              >
                {disconnecting ? "Disconnecting…" : "Disconnect server"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ServerDetailTabs({ server }: ServerDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: overviewContainers = [] } = useServerContainersQuery(server.id);

  const connectedIds = useMemo(() => {
    return new Set(
      overviewContainers
        .filter(
          (container) =>
            container.managedType === "KUBEARA_MANAGED" &&
            container.templateId &&
            container.isOnline,
        )
        .map((container) => container.templateId as string),
    );
  }, [overviewContainers]);

  return (
    <div className="server-detail-tabs">
      <div
        className="server-detail-tablist"
        role="tablist"
        aria-label="Server sections"
      >
        {TABS.map((tab) => (
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
        {activeTab === "overview" && <OverviewTab serverId={server.id} />}
        {activeTab === "templates" && (
          <TemplatesTab
            serverId={server.id}
            connectedIds={connectedIds}
          />
        )}
        {activeTab === "insights" && <InsightsTab serverId={server.id} />}
        {activeTab === "activity" && (
          <ActivityTab serverId={server.id} serverName={server.name} />
        )}
        {activeTab === "settings" && <SettingsTab server={server} />}
      </div>
    </div>
  );
}
