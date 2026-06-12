import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/api/api-error";
import { useServerTerminal } from "../hooks/use-server-terminal";
import {
  ServerTerminalViewer,
  type ServerTerminalViewerApi,
} from "./server-terminal-viewer";
import "@/components/shared/kubeara-terminal-shell.css";

type ServerTerminalPanelProps = {
  serverId: string;
  serverName: string;
  serverHost: string;
  isVisible: boolean;
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

export function ServerTerminalPanel({
  serverId,
  serverName,
  serverHost,
  isVisible,
}: ServerTerminalPanelProps) {
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
    refitToken,
    connect,
    disconnect,
    sendInput,
    sendResize,
    refit,
  } = useServerTerminal({
    serverId,
    onOutput: handleOutput,
    onSessionClosed: handleSessionClosed,
  });

  useEffect(() => {
    if (isVisible && status === "connected") {
      refit();
    }
  }, [isVisible, refit, status]);

  const handleConnect = () => {
    const dimensions = terminalApiRef.current?.getDimensions();
    void connect(
      dimensions ? { cols: dimensions.cols, rows: dimensions.rows } : undefined,
    );
  };

  const handleDisconnect = () => {
    void disconnect();
    terminalApiRef.current?.reset();
  };

  const handleReconnect = () => {
    terminalApiRef.current?.reset();
    const dimensions = terminalApiRef.current?.getDimensions();
    void connect(
      dimensions ? { cols: dimensions.cols, rows: dimensions.rows } : undefined,
    );
  };

  const toggleFullscreen = useCallback(async () => {
    const element = shellRef.current;
    if (!element) return;

    if (!document.fullscreenElement) {
      await element.requestFullscreen();
      setIsFullscreen(true);
      refit();
      return;
    }

    await document.exitFullscreen();
    setIsFullscreen(false);
    refit();
  }, [refit]);

  useEffect(() => {
    function handleFullscreenChange() {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      refit();
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [refit]);

  const isConnecting = status === "connecting";
  const isSessionActive = status === "connected";
  const showTerminal = isConnecting || isSessionActive;

  const introMessage =
    status === "disconnected"
      ? "Session ended. Reconnect to continue."
      : status === "error"
        ? "Could not open a terminal session."
        : "Open a terminal session on this server.";

  return (
    <section
      ref={shellRef}
      className={`server-terminal-shell${showTerminal ? " has-session" : ""}${isFullscreen ? " is-fullscreen" : ""}${isVisible ? " is-visible" : ""}`}
      aria-hidden={!isVisible}
    >
      <div
        className={`server-terminal-card${showTerminal ? " has-session" : ""}`}
      >
        <div className="server-terminal-intro">
          <div className="server-terminal-intro-copy">
            <h2 className="server-detail-section-title">Terminal</h2>
            {showTerminal ? (
              <p className="server-terminal-session-host">
                {serverName}
                <span className="server-terminal-host-sep">·</span>
                {serverHost}
              </p>
            ) : (
              <p className="server-detail-section-desc">{introMessage}</p>
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
                    className={`server-terminal-status-dot${isSocketConnected ? " connected" : ""}`}
                    aria-hidden
                  />
                  {isSocketConnected ? "Live" : "Reconnecting…"}
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

            {status === "idle" && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleConnect}
              >
                Connect
              </button>
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

            {isSessionActive && (
              <button
                type="button"
                className="btn-danger"
                onClick={handleDisconnect}
              >
                Disconnect
              </button>
            )}

            {status === "error" && !showTerminal && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleConnect}
              >
                Retry
              </button>
            )}

            {status === "disconnected" && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleReconnect}
              >
                Reconnect
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
              isVisible={isVisible && isSessionActive}
              refitToken={refitToken}
              onData={sendInput}
              onResize={sendResize}
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
