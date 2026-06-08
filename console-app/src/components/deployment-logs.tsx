import { BackLink } from "@/components/shared/back-link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { DeploymentTerminalViewer } from "@/components/deployment-terminal-viewer";
import {
  IconMaximize,
  IconMinimize,
  IconRestore,
} from "@/components/deployment-terminal-icons";
import {
  useDeploymentLogStream,
  useDeploymentQuery,
} from "@/features/deployments/hooks";
import type { StreamStatus } from "@/features/deployments/types";
import {
  countDeploymentLogsByView,
  filterDeploymentLogsByView,
  hasContainerDeploymentLogs,
  type DeploymentLogView,
} from "@/features/deployments/utils/deployment-log-filters";
import type { DeploymentStatus } from "@/constants/deployment-events";
import type { Template } from "@/types";
import "./deployment-logs.css";

type DeploymentLogsProps = {
  template: Template;
  deploymentId?: string;
  serverId: string;
  backHref: string;
  isStarting?: boolean;
  startError?: string | null;
};

function TerminalToolbar({
  title,
  lineCount,
  logView,
  installationLineCount,
  containerLineCount,
  containerLogsAvailable,
  isCollapsed,
  isFullscreen,
  isSocketConnected,
  onLogViewChange,
  onToggleCollapse,
  onToggleFullscreen,
}: {
  title: string;
  lineCount: number;
  logView: DeploymentLogView;
  installationLineCount: number;
  containerLineCount: number;
  containerLogsAvailable: boolean;
  isCollapsed: boolean;
  isFullscreen: boolean;
  isSocketConnected: boolean;
  onLogViewChange: (view: DeploymentLogView) => void;
  onToggleCollapse: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="deploy-terminal-toolbar">
      <div className="deploy-terminal-toolbar-title">
        <span>{title}</span>
        <span className="deploy-terminal-line-count">{lineCount} lines</span>
      </div>

      <div className="deploy-terminal-toolbar-actions">
        <div
          className="deploy-terminal-source-toggle"
          role="tablist"
          aria-label="Log source"
        >
          <button
            type="button"
            role="tab"
            aria-selected={logView === "installation"}
            className={`deploy-terminal-source-btn ${logView === "installation" ? "active" : ""}`}
            onClick={() => onLogViewChange("installation")}
          >
            Installation logs
            {installationLineCount > 0 ? (
              <span className="deploy-terminal-source-count">
                {installationLineCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={logView === "container"}
            className={`deploy-terminal-source-btn ${logView === "container" ? "active" : ""}`}
            disabled={!containerLogsAvailable}
            title={
              containerLogsAvailable
                ? "Docker container stdout/stderr"
                : "Available after the service container starts"
            }
            onClick={() => onLogViewChange("container")}
          >
            Container logs
            {containerLineCount > 0 ? (
              <span className="deploy-terminal-source-count">
                {containerLineCount}
              </span>
            ) : null}
          </button>
        </div>

        <span
          className={`deploy-terminal-stream-indicator ${isSocketConnected ? "connected" : ""}`}
          title={isSocketConnected ? "Log stream connected" : "Reconnecting…"}
        />

        <button
          type="button"
          className="deploy-terminal-icon-btn"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand terminal" : "Collapse terminal"}
        >
          <IconMinimize />
        </button>
        <button
          type="button"
          className="deploy-terminal-icon-btn"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <IconRestore /> : <IconMaximize />}
        </button>
      </div>
    </div>
  );
}

export function DeploymentLogs({
  template,
  deploymentId,
  serverId,
  backHref,
  isStarting = false,
  startError = null,
}: DeploymentLogsProps) {
  const terminalRef = useRef<HTMLElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [logView, setLogView] = useState<DeploymentLogView>("installation");

  const deploymentQuery = useDeploymentQuery(deploymentId);
  const { logs, status, deploymentStatus, hasReceivedStatus, isSocketConnected } =
    useDeploymentLogStream({
      deploymentId,
      serverId,
      enabled: Boolean(serverId && deploymentId),
    });

  const liveDeploymentStatus =
    hasReceivedStatus && deploymentStatus
      ? deploymentStatus
      : (deploymentQuery.data?.deploymentStatus ?? deploymentStatus ?? null);

  const containerLogsAvailable = useMemo(() => {
    if (hasContainerDeploymentLogs(logs)) {
      return true;
    }
    const deployStatus = liveDeploymentStatus;
    return (
      deployStatus === "deploying" ||
      deployStatus === "running" ||
      deployStatus === "success" ||
      deployStatus === "pulling" ||
      deployStatus === "building"
    );
  }, [liveDeploymentStatus, logs]);

  const filteredLogs = useMemo(
    () => filterDeploymentLogsByView(logs, logView),
    [logs, logView],
  );

  const installationLineCount = useMemo(
    () => countDeploymentLogsByView(logs, "installation"),
    [logs],
  );

  const containerLineCount = useMemo(
    () => countDeploymentLogsByView(logs, "container"),
    [logs],
  );

  const filteredLineCount = filteredLogs.length;

  useEffect(() => {
    if (logView === "container" && !containerLogsAvailable) {
      setLogView("installation");
    }
  }, [containerLogsAvailable, logView]);

  const isStreaming = status === "connecting" || status === "streaming";

  const emptyMessage =
    startError ??
    (isStarting && !deploymentId
      ? "Starting deployment and connecting to live log stream…"
      : logView === "container"
        ? isStreaming
          ? "Waiting for container output — logs appear after the service container starts (e.g. postgres)…"
          : "No container logs captured for this deployment."
        : isStreaming
          ? "Live console — agent install and template deploy output will appear here…"
          : "No installation or deploy logs captured for this deployment yet.");

  const toggleFullscreen = useCallback(async () => {
    const element = terminalRef.current;
    if (!element) return;

    if (!document.fullscreenElement) {
      await element.requestFullscreen();
      setIsFullscreen(true);
      return;
    }

    await document.exitFullscreen();
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const resolvedStatus = liveDeploymentStatus;

  return (
    <div
      className={`deploy-logs-page ${isFullscreen ? "is-fullscreen" : ""}`}
      style={{ "--deploy-accent": template.color } as CSSProperties}
    >
      <BackLink to={backHref} label="Back" />

      <article className="deploy-service-card">
        <div
          className="deploy-service-card-accent"
          style={{ background: template.color }}
        />
        <div className="deploy-service-card-main">
          <div
            className="deploy-service-icon"
            style={{
              backgroundColor: `${template.color}20`,
              color: template.color,
            }}
          >
            {template.name.charAt(0)}
          </div>
          <div className="deploy-service-content">
            <div className="deploy-service-headline">
              <h1>{template.name}</h1>
              <span className={`deploy-status-badge ${status}`}>
                {statusLabel(status, isStarting, liveDeploymentStatus)}
              </span>
            </div>
            <p className="deploy-service-category">{template.category}</p>
            <p className="deploy-service-description">{template.description}</p>
            <dl className="deploy-service-meta-grid">
              <div className="deploy-service-meta-item">
                <dt>Template</dt>
                <dd>{template.name}</dd>
              </div>
              <div className="deploy-service-meta-item">
                <dt>Deployment ID</dt>
                <dd>
                  <code>{deploymentId ?? "Pending…"}</code>
                </dd>
              </div>
              <div className="deploy-service-meta-item">
                <dt>Stream</dt>
                <dd>
                  <span
                    className={`deploy-meta-pill ${isSocketConnected ? "is-live" : ""}`}
                  >
                    {isSocketConnected ? "Connected" : "Reconnecting"}
                  </span>
                </dd>
              </div>
              <div className="deploy-service-meta-item">
                <dt>Status</dt>
                <dd>
                  {startError ??
                    (hasReceivedStatus
                      ? formatDeploymentStatus(liveDeploymentStatus)
                      : null) ??
                    deploymentQuery.data?.statusMessage ??
                    resolvedStatus ??
                    deploymentStateLabel(status, isStarting, liveDeploymentStatus)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </article>

      <section
        ref={terminalRef}
        className={`deploy-terminal-window ${isCollapsed ? "is-collapsed" : ""}`}
        aria-label="Deployment logs"
      >
        <TerminalToolbar
          title={`${template.id} — live logs`}
          lineCount={filteredLineCount}
          logView={logView}
          installationLineCount={installationLineCount}
          containerLineCount={containerLineCount}
          containerLogsAvailable={containerLogsAvailable}
          isCollapsed={isCollapsed}
          isFullscreen={isFullscreen}
          isSocketConnected={isSocketConnected}
          onLogViewChange={setLogView}
          onToggleCollapse={() => setIsCollapsed((value) => !value)}
          onToggleFullscreen={() => void toggleFullscreen()}
        />

        {!isCollapsed ? (
          <div className="deploy-terminal-body">
            <div className="deploy-terminal-pane is-active">
              <DeploymentTerminalViewer
                key={logView}
                lines={filteredLogs}
                isActive
                emptyMessage={emptyMessage}
                isLive={isStreaming}
              />
            </div>
          </div>
        ) : (
          <div className="deploy-terminal-collapsed-body">
            <p>
              Terminal collapsed · {filteredLineCount}{" "}
              {logView === "installation" ? "installation" : "container"} lines
            </p>
            <button
              type="button"
              className="deploy-terminal-icon-btn"
              onClick={() => setIsCollapsed(false)}
              aria-label="Expand terminal"
            >
              <IconMaximize />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function statusLabel(
  status: StreamStatus,
  isStarting: boolean,
  deploymentStatus: DeploymentStatus | null,
): string {
  if (deploymentStatus === "success") {
    return "Complete";
  }
  if (
    deploymentStatus === "failed" ||
    deploymentStatus === "cancelled" ||
    deploymentStatus === "removed"
  ) {
    return "Error";
  }
  if (deploymentStatus === "running") {
    return "Live";
  }
  if (deploymentStatus === "deploying") {
    return "Deploying";
  }

  if (isStarting && status === "connecting") {
    return "Starting";
  }

  switch (status) {
    case "connecting":
      return "Connecting";
    case "streaming":
      return "Live";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
  }
}

function formatDeploymentStatus(status: DeploymentStatus | null): string | null {
  if (!status) return null;
  switch (status) {
    case "pending":
      return "Queued";
    case "validating":
      return "Validating";
    case "pulling":
      return "Pulling images";
    case "building":
      return "Building";
    case "deploying":
      return "Deploying";
    case "running":
      return "Running";
    case "success":
      return "Deployed successfully";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "removing":
      return "Removing";
    case "removed":
      return "Removed";
    default:
      return status;
  }
}

function deploymentStateLabel(
  status: StreamStatus,
  isStarting: boolean,
  deploymentStatus: DeploymentStatus | null,
): string {
  const fromStatus = formatDeploymentStatus(deploymentStatus);
  if (fromStatus) {
    return fromStatus;
  }

  if (isStarting) {
    return "Preparing deployment…";
  }

  switch (status) {
    case "connecting":
      return "Connecting to log stream…";
    case "streaming":
      return "Streaming logs";
    case "complete":
      return "Deployed successfully";
    case "error":
      return "Failed / interrupted";
  }
}
