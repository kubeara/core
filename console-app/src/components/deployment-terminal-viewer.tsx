import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { DeploymentLogLine } from "@/features/deployments/types";

const TERMINAL_THEME = {
  background: "#0b0f14",
  foreground: "#e6edf3",
  cursor: "#e6e6e6",
  cursorAccent: "#0b0f14",
  black: "#0d1117",
  red: "#ff7b72",
  green: "#3dd68c",
  yellow: "#f0c14b",
  blue: "#7ec8ff",
  magenta: "#d2a8ff",
  cyan: "#39c5cf",
  white: "#e6edf3",
  brightBlack: "#6e7681",
  brightRed: "#ff7b72",
  brightGreen: "#3dd68c",
  brightYellow: "#f0c14b",
  brightBlue: "#7ec8ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#39c5cf",
  brightWhite: "#e6edf3",
};

const SCROLL_STICK_THRESHOLD_PX = 48;

type DeploymentTerminalViewerProps = {
  lines: DeploymentLogLine[];
  isActive: boolean;
  emptyMessage?: string;
  isLive?: boolean;
};

export function DeploymentTerminalViewer({
  lines,
  isActive,
  emptyMessage = "Waiting for logs…",
  isLive = false,
}: DeploymentTerminalViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenCountRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      theme: TERMINAL_THEME,
      fontFamily:
        '"Geist Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace',
      fontSize: 13,
      lineHeight: 1.45,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 10000,
      convertEol: true,
      smoothScrollDuration: 80,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(host);

    termRef.current = term;
    fitRef.current = fitAddon;

    const fitTerminal = () => {
      if (!hostRef.current || !fitRef.current) return;
      try {
        fitRef.current.fit();
      } catch {
        // ignore fit errors during hidden layout
      }
    };

    fitTerminal();

    const observer = new ResizeObserver(() => {
      fitTerminal();
    });
    observer.observe(host);

    const viewport = host.querySelector(".xterm-viewport");
    const handleScroll = () => {
      if (!viewport) return;
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      stickToBottomRef.current = distanceFromBottom < SCROLL_STICK_THRESHOLD_PX;
    };

    viewport?.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      viewport?.removeEventListener("scroll", handleScroll);
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      writtenCountRef.current = 0;
      stickToBottomRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const fit = () => {
      try {
        fitRef.current?.fit();
      } catch {
        // ignore
      }
    };

    const timer = window.setTimeout(fit, 0);
    return () => window.clearTimeout(timer);
  }, [isActive, lines.length]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const newLines = lines.slice(writtenCountRef.current);
    if (newLines.length === 0) return;

    for (const line of newLines) {
      const messages = line.message.split(/\r?\n/);
      for (const msg of messages) {
        if (msg === "") continue;
        const colored =
          line.stream === "stderr"
            ? `\x1b[38;5;203m${msg}\x1b[0m`
            : msg;
        term.writeln(colored);
      }
    }

    writtenCountRef.current = lines.length;
    setIsEmpty(lines.length === 0);

    const shouldAutoScroll = stickToBottomRef.current || isLive;
    if (shouldAutoScroll) {
      stickToBottomRef.current = true;
      requestAnimationFrame(() => {
        term.scrollToBottom();
      });
    }
  }, [isLive, lines]);

  return (
    <div
      className={`deploy-terminal-viewer${isEmpty ? " is-empty" : ""}${isActive ? " is-active" : ""}`}
    >
      {isEmpty && (
        <div className="deploy-terminal-empty">
          <span className="log-cursor">▌</span>
          <span>
            {emptyMessage}
            {isLive && (
              <span
                className="deploy-terminal-stream-indicator live"
                style={{ marginLeft: 6 }}
              />
            )}
          </span>
        </div>
      )}
      <div ref={hostRef} className="deploy-terminal-xterm-host" />
    </div>
  );
}
