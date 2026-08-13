import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  fitAndSyncTerminal,
  updateMaxContentCols,
} from "@/components/shared/fit-terminal-for-content";
import {
  KUBEARA_TERMINAL_FONT,
  KUBEARA_TERMINAL_THEME,
} from "@/components/shared/kubeara-terminal-theme";
import { TerminalScrollDownButton } from "@/components/shared/terminal-scroll-down-button";
import { useTerminalScrollDown } from "@/components/shared/use-terminal-scroll-down";
import { useTerminalWheelTrap } from "@/components/shared/use-terminal-wheel-trap";
import "@/components/shared/terminal-scroll-down-button.css";
import type { DeploymentLogLine } from "@/features/deployments/types";
import { formatDeploymentLogAnsi } from "@/features/deployments/utils/format-deployment-log-ansi";

const SCROLL_STICK_THRESHOLD_PX = 48;

function scrollTerminalToBottom(term: Terminal): void {
  term.scrollToBottom();
}

type DeploymentTerminalViewerProps = {
  lines: DeploymentLogLine[];
  isActive: boolean;
  emptyMessage?: string;
  wordWrap?: boolean;
};

export function DeploymentTerminalViewer({
  lines,
  isActive,
  emptyMessage = "Waiting for logs…",
  wordWrap = true,
}: DeploymentTerminalViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hscrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenCountRef = useRef(0);
  const contentColsRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const wordWrapRef = useRef(wordWrap);
  const [isEmpty, setIsEmpty] = useState(true);

  wordWrapRef.current = wordWrap;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      theme: KUBEARA_TERMINAL_THEME,
      fontFamily: KUBEARA_TERMINAL_FONT,
      fontSize: 14,
      lineHeight: 1.4,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 10000,
      convertEol: true,
      smoothScrollDuration: 20,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(host);

    termRef.current = term;
    fitRef.current = fitAddon;

    const fitTerminal = () => {
      if (!hostRef.current || !fitRef.current || !termRef.current) return;
      const host = hostRef.current;
      if (host.clientWidth <= 0 || host.clientHeight <= 0) return;
      try {
        fitAndSyncTerminal(
          host,
          termRef.current,
          fitRef.current,
          contentColsRef.current,
          wordWrapRef.current,
        );
      } catch {
        // ignore fit errors during hidden layout
      }
    };

    fitTerminal();

    const resizeTarget = hscrollRef.current ?? host;
    let resizeDebounceTimer = 0;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = window.setTimeout(() => {
        fitTerminal();
      }, wordWrapRef.current ? 150 : 50);
    });
    observer.observe(resizeTarget);

    const viewport = host.querySelector(".xterm-viewport");
    const handleScroll = () => {
      if (!viewport) return;
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      stickToBottomRef.current = distanceFromBottom < SCROLL_STICK_THRESHOLD_PX;
    };

    viewport?.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      clearTimeout(resizeDebounceTimer);
      viewport?.removeEventListener("scroll", handleScroll);
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      writtenCountRef.current = 0;
      contentColsRef.current = 0;
      stickToBottomRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const fit = () => {
      if (!hostRef.current || !fitRef.current || !termRef.current) return;
      const host = hostRef.current;
      if (host.clientWidth <= 0 || host.clientHeight <= 0) return;
      try {
        fitAndSyncTerminal(
          host,
          termRef.current,
          fitRef.current,
          contentColsRef.current,
          wordWrapRef.current,
        );
      } catch {
        // ignore
      }
    };

    let nestedFrameId = 0;
    const frameId = requestAnimationFrame(() => {
      fit();
      nestedFrameId = requestAnimationFrame(fit);
    });

    return () => {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(nestedFrameId);
    };
  }, [isActive, wordWrap]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const newLines = lines.slice(writtenCountRef.current);
    if (newLines.length === 0) return;

    for (const line of newLines) {
      const messages = line.message.split(/\r?\n/);
      for (const msg of messages) {
        if (msg === "") continue;
        contentColsRef.current = updateMaxContentCols(
          contentColsRef.current,
          msg,
        );
        const colored = formatDeploymentLogAnsi(msg, line.stream);
        term.writeln(colored);
      }
    }

    writtenCountRef.current = lines.length;
    setIsEmpty(lines.length === 0);

    if (!wordWrapRef.current) {
      requestAnimationFrame(() => {
        if (!hostRef.current || !fitRef.current || !termRef.current) return;
        const host = hostRef.current;
        if (host.clientWidth <= 0 || host.clientHeight <= 0) return;
        try {
          fitAndSyncTerminal(
            host,
            term,
            fitRef.current,
            contentColsRef.current,
            wordWrapRef.current,
          );
        } catch {
          // ignore
        }
      });
    }

    const shouldAutoScroll = stickToBottomRef.current;
    if (shouldAutoScroll && isActive) {
      requestAnimationFrame(() => {
        scrollTerminalToBottom(term);
      });
    }
  }, [isActive, lines]);

  const scrollToBottom = useCallback(() => {
    stickToBottomRef.current = true;
    const term = termRef.current;
    if (term) {
      scrollTerminalToBottom(term);
    }
  }, []);

  const { visible: showScrollDown, handleClick: handleScrollDown } =
    useTerminalScrollDown(hostRef, scrollToBottom);

  useTerminalWheelTrap(frameRef, wordWrap);

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
      <div
        ref={frameRef}
        className={`terminal-viewer-frame${wordWrap ? " is-word-wrap" : ""}`}
      >
        <div ref={hscrollRef} className="terminal-xterm-hscroll">
          <div ref={hostRef} className="server-terminal-xterm-host" />
        </div>
        <TerminalScrollDownButton
          visible={showScrollDown && !isEmpty}
          onClick={handleScrollDown}
          hostRef={hostRef}
          tooltip="Go to latest output"
        />
      </div>
    </div>
  );
}
