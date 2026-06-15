import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/api/api-error";
import { useContainerLogs } from "@/features/deployments/hooks/use-container-logs";
import {
  ServerTerminalViewer,
  type ServerTerminalViewerApi,
} from "./server-terminal-viewer";
import "@/components/shared/kubeara-terminal-shell.css";

type ContainerLogsPanelProps = {
  serverId: string;
  containerId: string;
  containerName: string;
  serviceName?: string | null;
  serverName: string;
  serverHost: string;
};

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

export function ContainerLogsPanel({
  serverId,
  containerId,
  containerName,
  serviceName,
  serverName,
  serverHost,
}: ContainerLogsPanelProps) {
  const shellRef = useRef<HTMLElement>(null);
  const terminalApiRef = useRef<ServerTerminalViewerApi | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleOutput = useCallback((data: string) => {
    terminalApiRef.current?.write(data);
  }, []);

  const handleSessionClosed = useCallback(() => {
    terminalApiRef.current?.reset();
  }, []);

  const {
    status,
    errorMessage,
    isSocketConnected,
    start,
    stop,
  } = useContainerLogs({
    serverId,
    containerId,
    enabled: true,
    onOutput: handleOutput,
    onSessionClosed: handleSessionClosed,
  });

  const toggleFullscreen = useCallback(async () => {
    const element = shellRef.current;
    if (!element) return;

    if (!document.fullscreenElement) {
      await element.requestFullscreen();
      setIsFullscreen(true);
      terminalApiRef.current?.fit();
      return;
    }

    await document.exitFullscreen();
    setIsFullscreen(false);
    terminalApiRef.current?.fit();
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      terminalApiRef.current?.fit();
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const isConnecting = status === "connecting";
  const isStreaming = status === "streaming";
  const showTerminal = isConnecting || isStreaming || status === "complete";

  const logsHeadline = serviceName?.trim() || containerName;
  const showContainerName =
    Boolean(serviceName?.trim()) &&
    containerName.trim() !== serviceName?.trim();

  const introMessage =
    status === "error"
      ? "Could not stream container logs."
      : status === "complete"
        ? "Log stream ended."
        : "Streaming container logs from this server.";

  const handleStop = () => {
    void stop();
    terminalApiRef.current?.reset();
  };

  const handleRetry = () => {
    terminalApiRef.current?.reset();
    void start();
  };

  return (
    <section
      ref={shellRef}
      className={`server-terminal-shell${showTerminal ? " has-session" : ""}${isFullscreen ? " is-fullscreen" : ""} is-visible`}
    >
      <div
        className={`server-terminal-card${showTerminal ? " has-session" : ""}`}
      >
        <div className="server-terminal-intro">
          <div className="server-terminal-intro-copy">
            <h2 className="server-detail-section-title">
              {serviceName?.trim()
                ? `Logs — ${serviceName.trim()}`
                : `Logs — ${containerName}`}
            </h2>
            {showTerminal ? (
              <p className="server-terminal-session-host">
                <span className="server-terminal-session-primary">
                  {logsHeadline}
                </span>
                {showContainerName ? (
                  <>
                    <span className="server-terminal-host-sep">·</span>
                    <code>{containerName}</code>
                  </>
                ) : null}
                <span className="server-terminal-host-sep">·</span>
                {serverName}
                <span className="server-terminal-host-sep">·</span>
                {serverHost}
              </p>
            ) : (
              <p className="server-detail-section-desc">
                {serviceName?.trim()
                  ? `Streaming logs for ${serviceName.trim()} on this server.`
                  : introMessage}
              </p>
            )}
            {status === "error" && !showTerminal && (
              <p className="server-terminal-error-text">
                {errorMessage ?? getErrorMessage(null)}
              </p>
            )}
          </div>

          <div className="server-terminal-intro-actions">
            {showTerminal && (
              <>
                <span className="server-terminal-status">
                  <span
                    className={`server-terminal-status-dot${isSocketConnected && isStreaming ? " connected" : ""}`}
                    aria-hidden
                  />
                  {isConnecting
                    ? "Connecting…"
                    : isStreaming && isSocketConnected
                      ? "Live"
                      : "Reconnecting…"}
                </span>
                <button
                  type="button"
                  className="server-terminal-icon-btn"
                  onClick={() => void toggleFullscreen()}
                  aria-label={
                    isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                  }
                >
                  {isFullscreen ? <IconRestore /> : <IconMaximize />}
                </button>
              </>
            )}

            {isConnecting && (
              <button
                type="button"
                className="btn-primary is-loading"
                disabled
              >
                Connecting…
              </button>
            )}

            {isStreaming && (
              <button type="button" className="btn-danger" onClick={handleStop}>
                Stop
              </button>
            )}

            {status === "error" && !showTerminal && (
              <button type="button" className="btn-primary" onClick={handleRetry}>
                Retry
              </button>
            )}

            {status === "complete" && (
              <button type="button" className="btn-primary" onClick={handleRetry}>
                Restart stream
              </button>
            )}
          </div>
        </div>

        {showTerminal && (
          <div className="server-terminal-window">
            {isConnecting && (
              <div
                className="server-terminal-connecting-overlay"
                aria-live="polite"
              >
                <span
                  className="server-terminal-connecting-spinner"
                  aria-hidden
                />
                Connecting…
              </div>
            )}
            <ServerTerminalViewer
              isVisible={isStreaming || status === "complete"}
              readOnly
              onData={() => undefined}
              onResize={() => undefined}
              onReady={(api) => {
                terminalApiRef.current = api;
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
