import { Link } from "react-router-dom";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  type CSSProperties,
} from "react";
import { apiUrl } from "@/lib/api-client";
import type { DeployLogLevel } from "@/lib/deploy-logs";
import type { Template } from "@/lib/types";
import "./deployment-logs.css";

type LogLine = {
  id: string;
  level: DeployLogLevel;
  message: string;
  timestamp: string;
};

export type StreamStatus =
  | "connecting"
  | "streaming"
  | "complete"
  | "disconnected"
  | "error";

type DeploymentLogsProps = {
  template: Template;
};

type SsePayload = {
  type: string;
  level?: DeployLogLevel;
  message?: string;
  timestamp?: string;
  index?: number;
};

type LogStreamHandle = {
  disconnect: () => void;
};

type LogStreamProps = {
  templateId: string;
  onStatusChange: (status: StreamStatus) => void;
};

const LogStream = forwardRef<LogStreamHandle, LogStreamProps>(
  function LogStream({ templateId, onStatusChange }, ref) {
    const [lines, setLines] = useState<LogLine[]>([]);
    const [isActive, setIsActive] = useState(true);
    const eventSourceRef = useRef<EventSource | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);
    const lineIdRef = useRef(0);

    const disconnect = useCallback(() => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setIsActive(false);
      onStatusChange("disconnected");
    }, [onStatusChange]);

    useImperativeHandle(ref, () => ({ disconnect }), [disconnect]);

    useEffect(() => {
      const es = new EventSource(apiUrl(`/api/deploy/${templateId}/logs`));
      eventSourceRef.current = es;

      es.onopen = () => onStatusChange("streaming");

      es.onmessage = (event) => {
        const data = JSON.parse(event.data) as SsePayload;

        if (data.type === "log" && data.message && data.timestamp) {
          const { message, timestamp } = data;
          lineIdRef.current += 1;
          setLines((prev) => [
            ...prev,
            {
              id: `${data.index ?? lineIdRef.current}`,
              level: data.level ?? "info",
              message,
              timestamp,
            },
          ]);
        }

        if (data.type === "complete") {
          setIsActive(false);
          onStatusChange("complete");
          es.close();
          eventSourceRef.current = null;
        }

        if (data.type === "error") {
          setIsActive(false);
          onStatusChange("error");
          es.close();
          eventSourceRef.current = null;
        }
      };

      es.onerror = () => {
        if (!eventSourceRef.current) return;
        setIsActive(false);
        onStatusChange("error");
        es.close();
        eventSourceRef.current = null;
      };

      return () => {
        es.close();
        eventSourceRef.current = null;
      };
    }, [templateId, onStatusChange]);

    useEffect(() => {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [lines]);

    return (
      <div className="deploy-terminal-screen" role="log" aria-live="polite">
        {lines.length === 0 && (
          <p className="deploy-terminal-waiting">
            <span className="deploy-terminal-prompt-char">$</span>
            Waiting for deployment stream…
          </p>
        )}
        {lines.map((line) => (
          <div key={line.id} className={`log-line log-line-${line.level}`}>
            <span className="log-timestamp">{line.timestamp} </span>
            <span className="log-level">[{line.level.toUpperCase()}]</span>{" "}
            <span className="log-message">{line.message}</span>
          </div>
        ))}
        {isActive && lines.length > 0 && (
          <div className="log-line log-line-cursor">
            <span className="deploy-terminal-prompt-char">$</span>
            <span className="log-cursor">▋</span>
          </div>
        )}
        <div ref={logEndRef} />
      </div>
    );
  },
);

function TerminalToolbar({ templateId }: { templateId: string }) {
  return (
    <div className="deploy-terminal-toolbar">
      <div className="deploy-terminal-traffic" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="deploy-terminal-toolbar-title">
        <svg
          className="deploy-terminal-toolbar-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2H4V5zm0 5h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9z"
            fill="currentColor"
          />
        </svg>
        <span>
          kubeara — deploy/{templateId} — bash
        </span>
      </div>
      <div className="deploy-terminal-toolbar-spacer" aria-hidden />
    </div>
  );
}

export function DeploymentLogs({ template }: DeploymentLogsProps) {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [streamKey, setStreamKey] = useState(0);
  const streamRef = useRef<LogStreamHandle>(null);

  const handleStatusChange = useCallback((next: StreamStatus) => {
    setStatus(next);
  }, []);

  const disconnect = useCallback(() => {
    streamRef.current?.disconnect();
  }, []);

  const reconnect = useCallback(() => {
    setStatus("connecting");
    setStreamKey((k) => k + 1);
  }, []);

  const isStreaming = status === "connecting" || status === "streaming";

  return (
    <div
      className="deploy-logs-page"
      style={{ "--deploy-accent": template.color } as CSSProperties}
    >
      <Link to="/templates" className="deploy-logs-back">
        ← Back to Templates
      </Link>

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
                {statusLabel(status)}
              </span>
            </div>
            <p className="deploy-service-category">{template.category}</p>
            <p className="deploy-service-description">{template.description}</p>
            <dl className="deploy-service-meta-grid">
              <div className="deploy-service-meta-item">
                <dt>Template ID</dt>
                <dd>
                  <code>{template.id}</code>
                </dd>
              </div>
              <div className="deploy-service-meta-item">
                <dt>Deployment</dt>
                <dd>{deploymentStateLabel(status)}</dd>
              </div>
            </dl>
          </div>
        </div>
        <aside className="deploy-service-card-aside">
          {isStreaming && (
            <button
              type="button"
              className="btn-disconnect"
              onClick={disconnect}
            >
              Disconnect
            </button>
          )}
          {(status === "disconnected" || status === "error") && (
            <button type="button" className="btn-reconnect" onClick={reconnect}>
              Reconnect
            </button>
          )}
        </aside>
      </article>

      <section className="deploy-terminal-window" aria-label="Deployment logs">
        <TerminalToolbar templateId={template.id} />
        <LogStream
          key={streamKey}
          ref={streamRef}
          templateId={template.id}
          onStatusChange={handleStatusChange}
        />
      </section>
    </div>
  );
}

function statusLabel(status: StreamStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting";
    case "streaming":
      return "Streaming";
    case "complete":
      return "Complete";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
  }
}

function deploymentStateLabel(status: StreamStatus): string {
  switch (status) {
    case "connecting":
      return "Initializing…";
    case "streaming":
      return "Deploy in progress";
    case "complete":
      return "Deployed successfully";
    case "disconnected":
      return "Stopped by user";
    case "error":
      return "Failed / interrupted";
  }
}
