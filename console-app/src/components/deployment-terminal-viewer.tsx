import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  KUBEARA_TERMINAL_FONT,
  KUBEARA_TERMINAL_THEME,
} from "@/components/shared/kubeara-terminal-theme";
import type { DeploymentLogLine } from "@/features/deployments/types";

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
      theme: KUBEARA_TERMINAL_THEME,
      fontFamily: KUBEARA_TERMINAL_FONT,
      fontSize: 14,
      lineHeight: 1.4,
      letterSpacing: 0.2,
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
      className={`server-terminal-log-viewer${isEmpty ? " is-empty" : ""}${isActive ? " is-active" : ""}`}
    >
      {isEmpty && (
        <div className="server-terminal-empty">
          <span className="log-cursor">▌</span>
          <span>{emptyMessage}</span>
        </div>
      )}
      <div ref={hostRef} className="server-terminal-xterm-host" />
    </div>
  );
}
