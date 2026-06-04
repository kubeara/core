import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useDeleteServerMutation } from "@/features/servers/hooks";
import { useServerContainersQuery } from "@/features/deployments/hooks";
import type { ServerContainer } from "@/features/deployments/types";
import { ServerTemplatesPanel } from "@/features/templates/components/server-templates-panel";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { formatApiTimestamp } from "@/lib/unix-timestamp";
import {
  getServerActivity,
  getServerInsights,
  getServerSettings,
  type ActivityEntry,
} from "@/lib/server-detail-data";
import type { Server } from "@/types";
import "./server-detail-tabs.css";

type TabId = "overview" | "templates" | "insights" | "activity" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "templates", label: "Templates" },
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
    return "offline";
  }
  const normalized = container.status.toLowerCase();
  if (normalized.includes("up") || normalized.includes("running")) {
    return "running";
  }
  if (normalized.includes("exited") || normalized.includes("stopped")) {
    return "stopped";
  }
  return "degraded";
}

function formatPortsDisplay(ports: string): string {
  const trimmed = ports.trim();
  if (!trimmed) {
    return "—";
  }
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
}

function ConnectedServiceCard({ container }: { container: ServerContainer }) {
  const statusClass = containerStatusClass(container);
  const displayName =
    container.containerName || container.templateId || "Container";
  const statusLabel = container.isOnline ? container.status : "Offline";
  const portsDisplay = formatPortsDisplay(container.ports);

  return (
    <article
      className={`connected-service-card${!container.isOnline ? " connected-service-card-offline" : ""}`}
    >
      <header className="connected-service-header">
        <div className="connected-service-icon connected-service-icon-neutral">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="connected-service-heading">
          <h3 className="connected-service-name" title={displayName}>
            {displayName}
          </h3>
          {!container.isOnline ? (
            <span className="service-badge service-badge-offline">Offline</span>
          ) : (
            <span
              className={`service-badge service-badge-${container.managedType === "KUBEARA_MANAGED" ? "kubeara" : "self"}`}
            >
              {managedTypeLabel(container.managedType)}
            </span>
          )}
        </div>
      </header>
      <dl className="connected-service-details">
        <div className="connected-service-detail-row">
          <dt>Status</dt>
          <dd>
            <span className={`service-status service-status-${statusClass}`}>
              {statusLabel}
            </span>
          </dd>
        </div>
        {container.imageName ? (
          <div className="connected-service-detail-row">
            <dt>Image</dt>
            <dd className="connected-service-detail-value" title={container.imageName}>
              {container.imageName}
            </dd>
          </div>
        ) : null}
        <div className="connected-service-detail-row">
          <dt>Ports</dt>
          <dd
            className="connected-service-detail-value connected-service-detail-mono"
            title={container.ports || undefined}
          >
            {portsDisplay}
          </dd>
        </div>
        {container.runningSince ? (
          <div className="connected-service-detail-row">
            <dt>Running</dt>
            <dd className="connected-service-detail-value">{container.runningSince}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

function OverviewTab({ serverId }: { serverId: string }) {
  const { data: containers = [], isLoading, isError } =
    useServerContainersQuery(serverId);

  return (
    <div className="server-detail-panel">
      <h2 className="server-detail-section-title">Connected services</h2>
      <p className="server-detail-section-desc">
        Containers discovered on this server, including Kubeara deployments and
        self-managed workloads.
      </p>
      {isLoading ? (
        <p className="server-detail-empty">Loading containers…</p>
      ) : isError ? (
        <p className="server-detail-empty">
          Could not load containers. Ensure the agent is connected.
        </p>
      ) : containers.length === 0 ? (
        <p className="server-detail-empty">No services connected yet.</p>
      ) : (
        <div className="connected-services-grid">
          {containers.map((container) => (
            <ConnectedServiceCard
              key={
                container.containerId ??
                `${container.deploymentId ?? "offline"}-${container.containerName}`
              }
              container={container}
            />
          ))}
        </div>
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
  const navigate = useNavigate();
  const deleteMutation = useDeleteServerMutation();
  const settings = useMemo(() => getServerSettings(server), [server]);
  const [destroyOpen, setDestroyOpen] = useState(false);

  // async function handleConnect() {
  //   try {
  //     await connectMutation.mutateAsync(server.id);
  //   } catch {
  //     /* errors surfaced via mutation onError toast */
  //   }
  // }

  // async function handleDisconnect() {
  //   try {
  //     await disconnectMutation.mutateAsync(server.id);
  //   } catch {
  //     /* errors surfaced via mutation onError toast */
  //   }
  // }

  async function handleDestroy() {
    try {
      await deleteMutation.mutateAsync(server.id);
      setDestroyOpen(false);
      navigate("/servers", { replace: true });
    } catch {
      /* errors surfaced via mutation onError toast */
    }
  }

  function openDestroyModal() {
    setDestroyOpen(true);
  }

  function closeDestroyModal() {
    if (destroying) return;
    setDestroyOpen(false);
  }

  const destroying = deleteMutation.isPending;

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
            <dt>Last Connected At</dt>
            <dd>
              <time dateTime={server.lastConnectedAt ?? undefined}>
                {formatApiTimestamp(server.lastConnectedAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              <time dateTime={server.createdAt}>
                {formatApiTimestamp(server.createdAt, "Unknown")}
              </time>
            </dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>{settings.region}</dd>
          </div>
          <div>
            <dt>SSH port</dt>
            <dd>{settings.sshPort}</dd>
          </div>
          <div>
            <dt>Backup schedule</dt>
            <dd>{settings.backupSchedule}</dd>
          </div>
          <div>
            <dt>Maintenance window</dt>
            <dd>{settings.maintenanceWindow}</dd>
          </div>
        </dl>

        {/* <div className="settings-connection-actions">
          {isOnline ? (
            <button
              type="button"
              className={`btn-danger-outline${connectionLoading ? " is-loading" : ""}`}
              onClick={() => void handleDisconnect()}
              disabled={connectionLoading}
              aria-busy={connectionLoading}
            >
              {connectionLoading ? "Disconnecting…" : "Disconnect SSH"}
            </button>
          ) : (
            <button
              type="button"
              className={`btn-primary${connectionLoading ? " is-loading" : ""}`}
              onClick={() => void handleConnect()}
              disabled={connectionLoading}
              aria-busy={connectionLoading}
            >
              {connectionLoading ? "Connecting…" : "Connect SSH"}
            </button>
          )}
        </div> */}

        <div className="settings-toggles">
          <div className="settings-toggle-row">
            <div>
              <span className="settings-toggle-label">Auto-restart</span>
              <span className="settings-toggle-hint">
                Restart containers after failed health checks
              </span>
            </div>
            <span className="settings-readonly">
              {settings.autoRestart ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="settings-toggle-row">
            <div>
              <span className="settings-toggle-label">Monitoring</span>
              <span className="settings-toggle-hint">
                Collect metrics and send alerts to your workspace
              </span>
            </div>
            <span className="settings-readonly">
              {settings.monitoring ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>
      </section>

      <section className="settings-danger-zone">
        <h2>Destroy server</h2>
        <p>
          Permanently remove this server and disconnect all services. This
          action cannot be undone.
        </p>
        <button
          type="button"
          className="btn-danger"
          onClick={openDestroyModal}
        >
          Destroy server
        </button>
      </section>

      {destroyOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="destroy-server-title"
        >
          <div className="modal-dialog modal-dialog-sm">
            <div className="modal-header">
              <h2 id="destroy-server-title">Destroy server?</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={closeDestroyModal}
              >
                ×
              </button>
            </div>
            <p className="modal-body-text">
              <strong>{server.name}</strong> ({server.host}) will be removed
              permanently along with all connected services.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={destroying}
                onClick={closeDestroyModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn-danger${destroying ? " is-loading" : ""}`}
                disabled={destroying}
                aria-busy={destroying}
                onClick={() => void handleDestroy()}
              >
                {destroying ? "Destroying…" : "Destroy server"}
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
