import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/api/api-error";
import {
  useDisconnectServerMutation,
  useServerResourcesQuery,
} from "@/features/servers/hooks";
import type { ServerResources } from "@/features/servers/types";
import { ContainerActionConfirmModal } from "@/features/deployments/components/container-action-confirm-modal";
import { ContainerActionsMenu } from "@/features/deployments/components/container-actions-menu";
import {
  useContainerActionMutation,
  useServerContainersQuery,
} from "@/features/deployments/hooks";
import type {
  ContainerActionType,
  ServerContainer,
} from "@/features/deployments/types";
import { ServerTemplatesPanel } from "@/features/templates/components/server-templates-panel";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  formatBytes,
  formatLoadAverage,
  formatPercent,
  formatUptime,
} from "@/lib/format-metrics";
import { formatApiTimestamp } from "@/lib/unix-timestamp";
import {
  getServerActivity,
  type ActivityEntry,
} from "@/lib/server-detail-data";
import { ServerTerminalPanel } from "@/features/servers/components/server-terminal-panel";
import { SkeletonGrid } from "@/components/shared/skeleton";
import { Switch } from "@/components/ui/switch";
import type { Server } from "@/types";
import "@/features/templates/templates-ui.css";
import "./server-detail-tabs.css";
import { ContainerStatus } from "@/enums/container-status.enum";

type TabId =
  | "overview"
  | "templates"
  | "insights"
  | "activity"
  | "terminal"
  | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "templates", label: "Services" },
  { id: "insights", label: "Insights" },
  { id: "activity", label: "Activity" },
  { id: "terminal", label: "Terminal" },
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

function getContainerDisplayName(container: ServerContainer): string {
  const displayName =
    container.containerName || container.templateId || "Container";
  return displayName.replace(/^deployment-\d+-[^-]+-/, "");
}

function ConnectedServiceCard({
  container,
  pendingAction,
  onAction,
}: {
  container: ServerContainer;
  pendingAction: { containerId: string | null; action: ContainerActionType } | null;
  onAction: (container: ServerContainer, action: ContainerActionType) => void;
}) {
  const statusClass = containerStatusClass(container);
  const containerId = container.containerId;
  const canManage = Boolean(containerId);
  const isPending = Boolean(
    containerId &&
    pendingAction?.containerId === containerId &&
    pendingAction.action,
  );

  const displayName =
    container.containerName || container.templateId || "Container";

  const cleanName = getContainerDisplayName(container);

  const iconLetter = (cleanName || displayName).charAt(0).toUpperCase();

  const statusLabel = container.isOnline ? container.status : "Offline";
  const portsDisplay = container.ports?.match(/:(\d+)->/)?.[1] ?? "N/A";
  const subtitle = container.templateId ?? container.containerName;

  return (
    <article
      className={`marketplace-card overview-container-card${!container.isOnline ? " marketplace-card-offline" : ""}`}
    >
      {canManage && containerId ? (
        <ContainerActionsMenu
          container={container}
          isPending={isPending}
          pendingAction={pendingAction}
          onAction={onAction}
        />
      ) : null}
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
          <p
            className="marketplace-card-description"
            title={container.imageName}
          >
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

function OverviewTab({
  serverId,
  containers,
  isLoading,
  isError,
}: {
  serverId: string;
  containers: ServerContainer[];
  isLoading: boolean;
  isError: boolean;
}) {
  const containerActionMutation = useContainerActionMutation();
  const [pendingAction, setPendingAction] = useState<{
    containerId: string | null;
    action: ContainerActionType;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    container: ServerContainer;
    action: ContainerActionType;
  } | null>(null);

  const isConfirmPending = Boolean(
    confirmAction &&
    pendingAction?.containerId === confirmAction.container.containerId &&
    pendingAction.action === confirmAction.action,
  );

  function handleContainerActionRequest(
    container: ServerContainer,
    action: ContainerActionType,
  ) {
    setConfirmAction({ container, action });
  }

  async function handleContainerActionConfirm() {
    if (!confirmAction?.container.containerId) {
      return;
    }

    const { container, action } = confirmAction;
    const containerId = container.containerId;

    setPendingAction({ containerId, action });
    try {
      await containerActionMutation.mutateAsync({
        serverId,
        containerId: containerId ?? "",
        containerName: getContainerDisplayName(container),
        action,
      });
      setConfirmAction(null);
    } finally {
      setPendingAction(null);
    }
  }
  const kubearaManagedContainers = containers.filter(
    (container) => container.managedType === "KUBEARA_MANAGED",
  );

  const selfManagedContainers = containers.filter(
    (container) => container.managedType !== "KUBEARA_MANAGED",
  );

  return (
    <div className="server-detail-panel">
      {confirmAction ? (
        <ContainerActionConfirmModal
          containerName={getContainerDisplayName(confirmAction.container)}
          action={confirmAction.action}
          isPending={isConfirmPending}
          onCancel={() => {
            if (!isConfirmPending) {
              setConfirmAction(null);
            }
          }}
          onConfirm={() => void handleContainerActionConfirm()}
        />
      ) : null}

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
                pendingAction={pendingAction}
                onAction={handleContainerActionRequest}
              />
            ))}
          </div>

          {selfManagedContainers.length > 0 && (
            <>
              <h3 className="connected-services-section-title">Self Managed</h3>

              <div className="server-templates-grid">
                {selfManagedContainers.map((container) => (
                  <ConnectedServiceCard
                    key={
                      container.containerId ??
                      `${container.deploymentId ?? "offline"}-${container.containerName}`
                    }
                    container={container}
                    pendingAction={pendingAction}
                    onAction={handleContainerActionRequest}
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

function InsightsTab({
  resources,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: {
  resources?: ServerResources;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="server-detail-panel">
        <h2 className="server-detail-section-title">Resource usage</h2>
        <p className="server-detail-section-desc">
          On-demand metrics from the connected agent.
        </p>
        <SkeletonGrid
          count={5}
          cardHeight={180}
          label="Loading server resources…"
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="server-detail-panel">
        <h2 className="server-detail-section-title">Resource usage</h2>
        <p className="server-detail-section-desc">
          On-demand metrics from the connected agent.
        </p>
        <div className="server-templates-state server-templates-state-error">
          <p className="server-templates-state-title">
            Unable to load server resources
          </p>
          <p className="server-templates-state-text">
            {errorMessage ??
              "Could not load resources. Ensure the agent is connected."}
          </p>
          <button type="button" className="btn-secondary" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!resources) {
    return (
      <div className="server-detail-panel">
        <h2 className="server-detail-section-title">Resource usage</h2>
        <p className="server-detail-empty">No resource metrics available.</p>
      </div>
    );
  }

  return (
    <div className="server-detail-panel">
      <h2 className="server-detail-section-title">Resource usage</h2>
      <p className="server-detail-section-desc">
        On-demand metrics from the connected agent
        {resources.timestamp ? (
          <>
            {" "}
            · collected{" "}
            <time dateTime={resources.timestamp}>
              {formatRelativeTime(resources.timestamp)}
            </time>
          </>
        ) : null}
        .
      </p>
      <div className="insights-grid">
        <article className="insight-card">
          <div className="insight-card-header">
            <h3>CPU</h3>
            <div className="insight-value">
              {resources.cpu.usagePercent.toFixed(1)}
              <span>%</span>
            </div>
          </div>
          <dl className="server-detail-grid">
            <div>
              <dt>CPU Usage</dt>
              <dd>{formatPercent(resources.cpu.usagePercent)}</dd>
            </div>
            <div>
              <dt>CPU Cores</dt>
              <dd>{resources.cpu.cores}</dd>
            </div>
            <div>
              <dt>Load Average</dt>
              <dd>{formatLoadAverage(resources.cpu.loadAverage)}</dd>
            </div>
          </dl>
        </article>

        <article className="insight-card">
          <div className="insight-card-header">
            <h3>Memory</h3>
            <div className="insight-value">
              {resources.memory.usagePercent.toFixed(1)}
              <span>%</span>
            </div>
          </div>
          <dl className="server-detail-grid">
            <div>
              <dt>Total Memory</dt>
              <dd>{formatBytes(resources.memory.total)}</dd>
            </div>
            <div>
              <dt>Used Memory</dt>
              <dd>{formatBytes(resources.memory.used)}</dd>
            </div>
            <div>
              <dt>Free Memory</dt>
              <dd>{formatBytes(resources.memory.free)}</dd>
            </div>
            <div>
              <dt>Usage</dt>
              <dd>{formatPercent(resources.memory.usagePercent)}</dd>
            </div>
          </dl>
        </article>

        <article className="insight-card">
          <div className="insight-card-header">
            <h3>Disk</h3>
            <div className="insight-value">
              {resources.disk.usagePercent.toFixed(1)}
              <span>%</span>
            </div>
          </div>
          <dl className="server-detail-grid">
            <div>
              <dt>Total Disk</dt>
              <dd>{formatBytes(resources.disk.total)}</dd>
            </div>
            <div>
              <dt>Used Disk</dt>
              <dd>{formatBytes(resources.disk.used)}</dd>
            </div>
            <div>
              <dt>Free Disk</dt>
              <dd>{formatBytes(resources.disk.free)}</dd>
            </div>
            <div>
              <dt>Usage</dt>
              <dd>{formatPercent(resources.disk.usagePercent)}</dd>
            </div>
          </dl>
        </article>

        <article className="insight-card">
          <div className="insight-card-header">
            <h3>Network</h3>
            <div className="insight-value">
              {formatBytes(resources.network.rxBytes)}
              <span>RX</span>
            </div>
          </div>
          <dl className="server-detail-grid">
            <div>
              <dt>RX Bytes</dt>
              <dd>{formatBytes(resources.network.rxBytes)}</dd>
            </div>
            <div>
              <dt>TX Bytes</dt>
              <dd>{formatBytes(resources.network.txBytes)}</dd>
            </div>
          </dl>
        </article>

        <article className="insight-card">
          <div className="insight-card-header">
            <h3>System</h3>
            <div className="insight-value">
              {formatUptime(resources.system.uptime)}
            </div>
          </div>
          <dl className="server-detail-grid">
            <div>
              <dt>Uptime</dt>
              <dd>{formatUptime(resources.system.uptime)}</dd>
            </div>
            <div>
              <dt>Hostname</dt>
              <dd>
                <code>{resources.system.hostname}</code>
              </dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>{resources.system.platform}</dd>
            </div>
            <div>
              <dt>Architecture</dt>
              <dd>{resources.system.architecture}</dd>
            </div>
          </dl>
        </article>
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
  const isOverviewTab = activeTab === "overview";
  const isInsightsTab = activeTab === "insights";
  const isTerminalTab = activeTab === "terminal";

  const {
    data: overviewContainers = [],
    isLoading: containersLoading,
    isError: containersError,
  } = useServerContainersQuery(server.id, {
    enabled: isOverviewTab,
    poll: isOverviewTab,
  });

  const {
    data: serverResources,
    isLoading: resourcesLoading,
    isError: resourcesError,
    error: resourcesQueryError,
    refetch: refetchResources,
  } = useServerResourcesQuery(server.id, {
    enabled: isInsightsTab,
  });

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
        {activeTab === "overview" && (
          <OverviewTab
            serverId={server.id}
            containers={overviewContainers}
            isLoading={containersLoading}
            isError={containersError}
          />
        )}
        {activeTab === "templates" && (
          <TemplatesTab serverId={server.id} connectedIds={connectedIds} />
        )}
        {activeTab === "insights" && (
          <InsightsTab
            resources={serverResources}
            isLoading={resourcesLoading}
            isError={resourcesError}
            errorMessage={
              resourcesQueryError
                ? getErrorMessage(resourcesQueryError)
                : undefined
            }
            onRetry={() => void refetchResources()}
          />
        )}
        {activeTab === "activity" && (
          <ActivityTab serverId={server.id} serverName={server.name} />
        )}
        <ServerTerminalPanel
          serverId={server.id}
          serverName={server.name}
          serverHost={server.host}
          isVisible={isTerminalTab}
        />
        {activeTab === "settings" && <SettingsTab server={server} />}
      </div>
    </div>
  );
}
