import { BackLink } from "@/components/shared/back-link";
import { ServiceBrandIcon } from "@/components/shared/service-brand-icon";
import { TerminalWordWrapToggle } from "@/components/shared/terminal-word-wrap-toggle";
import { TooltipHint } from "@/components/ui/tooltip";
import { useTerminalWordWrap } from "@/components/shared/use-terminal-word-wrap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeploymentTerminalViewer } from "@/components/deployment-terminal-viewer";
import "@/components/shared/kubeara-terminal-shell.css";
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
import { mapDeploymentFailureMessage } from "@/features/deployments/constants/deployment-failure-messages";
import type { DeploymentStatus } from "@/constants/deployment-events";
import type { Template } from "@/types";
import "./deployment-logs.css";

function IconMaximize() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRestore() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type DeploymentLogsProps = {
  template: Template;
  deploymentId?: string;
  serverId: string;
  backHref: string;
  isStarting?: boolean;
  startError?: string | null;
  onDeploymentFailed?: (message: string) => void;
};

function DeploymentLogsIntro({
  title,
  lineCount,
  logView,
  installationLineCount,
  containerLineCount,
  containerLogsAvailable,
  isFullscreen,
  isSocketConnected,
  wordWrap,
  onLogViewChange,
  onToggleFullscreen,
  onToggleWordWrap,
}: {
  title: string;
  lineCount: number;
  logView: DeploymentLogView;
  installationLineCount: number;
  containerLineCount: number;
  containerLogsAvailable: boolean;
  isFullscreen: boolean;
  isSocketConnected: boolean;
  wordWrap: boolean;
  onLogViewChange: (view: DeploymentLogView) => void;
  onToggleFullscreen: () => void;
  onToggleWordWrap: () => void;
}) {
  return (
    <div className="server-terminal-intro">
      <div className="server-terminal-intro-copy">
        <h2 className="server-detail-section-title">Deployment logs</h2>
        <div className="server-terminal-intro-headline">
          <p className="server-terminal-session-host">{title}</p>
          <div
            className="server-terminal-source-toggle"
            role="tablist"
            aria-label="Log source"
          >
            <button
              type="button"
              role="tab"
              aria-selected={logView === "installation"}
              className={`server-terminal-source-btn${logView === "installation" ? " active" : ""}`}
              onClick={() => onLogViewChange("installation")}
            >
              Installation
              {installationLineCount > 0 ? (
                <span className="server-terminal-source-count">
                  {installationLineCount}
                </span>
              ) : null}
            </button>
            <TooltipHint
              content={
                containerLogsAvailable
                  ? "Container output"
                  : "Available after the service starts"
              }
            >
              <span className="tooltip-trigger-wrap">
                <button
                  type="button"
                  role="tab"
                  aria-selected={logView === "container"}
                  className={`server-terminal-source-btn${logView === "container" ? " active" : ""}`}
                  disabled={!containerLogsAvailable}
                  onClick={() => onLogViewChange("container")}
                >
                  Container
                  {containerLineCount > 0 ? (
                    <span className="server-terminal-source-count">
                      {containerLineCount}
                    </span>
                  ) : null}
                </button>
              </span>
            </TooltipHint>
          </div>
        </div>
      </div>

      <div className="server-terminal-intro-actions">
        <span className="server-terminal-line-count">{lineCount} lines</span>
        <span className="server-terminal-status">
          <span
            className={`server-terminal-status-dot${isSocketConnected ? " connected" : ""}`}
            aria-hidden
          />
          {isSocketConnected ? "Live" : "Reconnecting…"}
        </span>
        <button
          type="button"
          className="server-terminal-icon-btn"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <IconRestore /> : <IconMaximize />}
        </button>
        <TerminalWordWrapToggle
          wordWrap={wordWrap}
          onToggle={onToggleWordWrap}
        />
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
  onDeploymentFailed,
}: DeploymentLogsProps) {
  const terminalRef = useRef<HTMLElement>(null);
  const failureHandledRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [logView, setLogView] = useState<DeploymentLogView>("installation");
  const { wordWrap, toggleWordWrap } = useTerminalWordWrap();

  const deploymentQuery = useDeploymentQuery(deploymentId);
  const {
    logs,
    status,
    deploymentStatus,
    deploymentStatusMessage,
    deploymentError,
    hasReceivedStatus,
    isSocketConnected,
  } = useDeploymentLogStream({
    deploymentId,
    serverId,
    enabled: Boolean(serverId && deploymentId),
  });

  const liveDeploymentStatus =
    hasReceivedStatus && deploymentStatus
      ? deploymentStatus
      : (deploymentQuery.data?.deploymentStatus ?? deploymentStatus ?? null);

  const liveDeploymentError =
    deploymentError ?? deploymentQuery.data?.lastError ?? null;

  const liveDeploymentStatusMessage =
    deploymentStatusMessage ?? deploymentQuery.data?.statusMessage ?? null;

  useEffect(() => {
    failureHandledRef.current = false;
  }, [deploymentId]);

  useEffect(() => {
    if (!onDeploymentFailed || failureHandledRef.current) {
      return;
    }

    if (liveDeploymentStatus !== "failed") {
      return;
    }

    const logText = logs.map((line) => line.message).join("\n");
    const message = mapDeploymentFailureMessage(
      liveDeploymentError,
      liveDeploymentStatusMessage,
      logText,
    );

    failureHandledRef.current = true;
    onDeploymentFailed(message);
  }, [
    liveDeploymentError,
    liveDeploymentStatus,
    liveDeploymentStatusMessage,
    logs,
    onDeploymentFailed,
  ]);

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
          ? "Waiting for service output. Logs appear once the service is running."
          : "No container logs captured for this deployment."
        : isStreaming
          ? "Installation and deploy output will appear here…"
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isFullscreen, logView]);

  return (
    <div className={`deploy-logs-page ${isFullscreen ? "is-fullscreen" : ""}`}>
      <BackLink to={backHref} label="Back" />

      <article className="deploy-service-card">
        <div className="deploy-service-card-accent" />
        <div className="deploy-service-card-main">
          <ServiceBrandIcon
            name={template.name}
            logo={template.logo}
            className="deploy-service-icon"
            style={{
              backgroundColor: `${template.color}20`,
              color: template.color,
            }}
          />
          <div className="deploy-service-content">
            <div className="deploy-service-card-top">
              <div className="deploy-service-details">
                <div className="deploy-service-headline">
                  <h1>{template.name}</h1>
                  <span className={`deploy-status-badge ${status}`}>
                    {statusLabel(status, isStarting, liveDeploymentStatus)}
                  </span>
                </div>
                {template.category ? (
                  <p className="deploy-service-category">{template.category}</p>
                ) : null}
                {template.description ? (
                  <p className="deploy-service-description">
                    {template.description}
                  </p>
                ) : null}
              </div>
              <p className="deploy-service-deployment-id">
                <code>{deploymentId ?? "Pending…"}</code>
              </p>
            </div>
          </div>
        </div>
      </article>

      <section
        ref={terminalRef}
        className={`server-terminal-shell is-visible has-session${isFullscreen ? " is-fullscreen" : ""}`}
        aria-label="Deployment logs"
      >
        <div className="server-terminal-card has-session">
          <DeploymentLogsIntro
            title={`${template.name} — live logs`}
            lineCount={filteredLineCount}
            logView={logView}
            installationLineCount={installationLineCount}
            containerLineCount={containerLineCount}
            containerLogsAvailable={containerLogsAvailable}
            isFullscreen={isFullscreen}
            isSocketConnected={isSocketConnected}
            wordWrap={wordWrap}
            onLogViewChange={setLogView}
            onToggleFullscreen={() => void toggleFullscreen()}
            onToggleWordWrap={toggleWordWrap}
          />

          <div className="server-terminal-window">
            {isStreaming && filteredLineCount === 0 && (
              <div
                className="server-terminal-connecting-overlay"
                aria-live="polite"
              >
                <span
                  className="server-terminal-connecting-spinner"
                  aria-hidden
                />
                {emptyMessage}
              </div>
            )}
            <DeploymentTerminalViewer
              key={logView}
              lines={filteredLogs}
              isActive
              emptyMessage={emptyMessage}
              isLive={isStreaming}
              wordWrap={wordWrap}
            />
          </div>
        </div>
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
