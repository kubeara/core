import { BackLink } from "@/components/shared/back-link";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  memo,
  type CSSProperties,
} from "react";
import { buildApiUrl } from "@/api/axios";
import type { DeployLogLevel } from "@/lib/deploy-logs";
import type { Template } from "@/types";
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

const MAX_LOG_LINES = 2000;
const SCROLL_BATCH_MS = 80;

const LogLineRow = memo(function LogLineRow({ line }: { line: LogLine }) {
  return (
    <div className={`log-line log-line-${line.level}`}>
      <span className="log-timestamp">{line.timestamp} </span>
      <span className="log-level">[{line.level.toUpperCase()}]</span>{" "}
      <span className="log-message">{line.message}</span>
    </div>
  );
});

const LogStream = forwardRef<LogStreamHandle, LogStreamProps>(
  function LogStream({ templateId, onStatusChange }, ref) {
    const [lines, setLines] = useState<LogLine[]>([]);
    const [isActive, setIsActive] = useState(true);
    const eventSourceRef = useRef<EventSource | null>(null);
    const screenRef = useRef<HTMLDivElement>(null);
    const lineIdRef = useRef(0);
    const pendingLinesRef = useRef<LogLine[]>([]);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shouldStickToBottomRef = useRef(true);

    const disconnect = useCallback(() => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setIsActive(false);
      onStatusChange("disconnected");
    }, [onStatusChange]);

    useImperativeHandle(ref, () => ({ disconnect }), [disconnect]);

    const flushPendingLines = useCallback(() => {
      flushTimerRef.current = null;
      const batch = pendingLinesRef.current;
      if (batch.length === 0) return;
      pendingLinesRef.current = [];

      setLines((prev) => {
        const next = [...prev, ...batch];
        if (next.length <= MAX_LOG_LINES) return next;
        return next.slice(next.length - MAX_LOG_LINES);
      });
    }, []);

    const queueLine = useCallback(
      (line: LogLine) => {
        pendingLinesRef.current.push(line);
        if (flushTimerRef.current == null) {
          flushTimerRef.current = setTimeout(flushPendingLines, SCROLL_BATCH_MS);
        }
      },
      [flushPendingLines],
    );

    useEffect(() => {
      const es = new EventSource(buildApiUrl(`/deploy/${templateId}/logs`));
      eventSourceRef.current = es;

      es.onopen = () => onStatusChange("streaming");

      es.onmessage = (event) => {
        const data = JSON.parse(event.data) as SsePayload;

        if (data.type === "log" && data.message && data.timestamp) {
          lineIdRef.current += 1;
          queueLine({
            id: `${data.index ?? lineIdRef.current}`,
            level: data.level ?? "info",
            message: data.message,
            timestamp: data.timestamp,
          });
        }

        if (data.type === "complete") {
          flushPendingLines();
          setIsActive(false);
          onStatusChange("complete");
          es.close();
          eventSourceRef.current = null;
        }

        if (data.type === "error") {
          flushPendingLines();
          setIsActive(false);
          onStatusChange("error");
          es.close();
          eventSourceRef.current = null;
        }
      };

      es.onerror = () => {
        if (!eventSourceRef.current) return;
        flushPendingLines();
        setIsActive(false);
        onStatusChange("error");
        es.close();
        eventSourceRef.current = null;
      };

      return () => {
        if (flushTimerRef.current != null) {
          clearTimeout(flushTimerRef.current);
        }
        es.close();
        eventSourceRef.current = null;
      };
    }, [templateId, onStatusChange, queueLine, flushPendingLines]);

    useEffect(() => {
      const screen = screenRef.current;
      if (!screen) return;

      function handleScroll() {
        const el = screenRef.current;
        if (!el) return;
        const distanceFromBottom =
          el.scrollHeight - el.scrollTop - el.clientHeight;
        shouldStickToBottomRef.current = distanceFromBottom < 48;
      }

      screen.addEventListener("scroll", handleScroll, { passive: true });
      return () => screen.removeEventListener("scroll", handleScroll);
    }, []);

    useLayoutEffect(() => {
      if (!shouldStickToBottomRef.current) return;
      const screen = screenRef.current;
      if (!screen) return;
      screen.scrollTop = screen.scrollHeight;
    }, [lines]);

    return (
      <div
        ref={screenRef}
        className="deploy-terminal-screen"
        role="log"
        aria-live="polite"
      >
        {lines.length === 0 && (
          <p className="deploy-terminal-waiting">
            <span className="deploy-terminal-prompt-char">$</span>
            Waiting for deployment stream…
          </p>
        )}
        {lines.map((line) => (
          <LogLineRow key={line.id} line={line} />
        ))}
        {isActive && lines.length > 0 && (
          <div className="log-line log-line-cursor">
            <span className="deploy-terminal-prompt-char">$</span>
            <span className="log-cursor">▋</span>
          </div>
        )}
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
      <BackLink to="/templates" label="Back to Templates" />

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
                <dt>Template</dt>
                <dd>{template.name}</dd>
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
