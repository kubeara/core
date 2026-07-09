import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
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

export type ServerTerminalViewerApi = {
  write: (data: string) => void;
  reset: () => void;
  fit: () => void;
  getDimensions: () => { cols: number; rows: number };
  focus: () => void;
};

type ServerTerminalViewerProps = {
  isVisible: boolean;
  refitToken?: number;
  readOnly?: boolean;
  wordWrap?: boolean;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onReady?: (api: ServerTerminalViewerApi) => void;
};

export function ServerTerminalViewer({
  isVisible,
  refitToken = 0,
  readOnly = false,
  wordWrap = true,
  onData,
  onResize,
  onReady,
}: ServerTerminalViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hscrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const contentColsRef = useRef(0);
  const fitFrameRef = useRef(0);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const onReadyRef = useRef(onReady);
  const wordWrapRef = useRef(wordWrap);

  onDataRef.current = onData;
  onResizeRef.current = onResize;
  onReadyRef.current = onReady;
  wordWrapRef.current = wordWrap;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      theme: KUBEARA_TERMINAL_THEME,
      fontFamily: KUBEARA_TERMINAL_FONT,
      fontSize: 14,
      lineHeight: 1.4,
      cursorBlink: !readOnly,
      cursorStyle: "bar",
      disableStdin: readOnly,
      scrollback: 10000,
      convertEol: readOnly,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(host);

    termRef.current = term;
    fitRef.current = fitAddon;

    const fitTerminal = (notifyRemote = true) => {
      if (!hostRef.current || !fitRef.current || !termRef.current) return;
      try {
        fitAndSyncTerminal(
          hostRef.current,
          termRef.current,
          fitRef.current,
          contentColsRef.current,
          wordWrapRef.current,
        );
        if (notifyRemote) {
          onResizeRef.current(termRef.current.cols, termRef.current.rows);
        }
      } catch {
        // hidden containers cannot be measured yet
      }
    };

    const syncCursorLineCols = () => {
      const buffer = term.buffer.active;
      const line = buffer.getLine(buffer.baseY + buffer.cursorY);
      if (!line) return false;

      const prev = contentColsRef.current;
      contentColsRef.current = updateMaxContentCols(
        prev,
        line.translateToString(false),
      );
      return contentColsRef.current !== prev;
    };

    const scheduleFit = (notifyRemote = true) => {
      cancelAnimationFrame(fitFrameRef.current);
      fitFrameRef.current = requestAnimationFrame(() => {
        fitTerminal(notifyRemote);
      });
    };

    const dataDisposable = readOnly
      ? { dispose: () => undefined }
      : term.onData((data) => {
          onDataRef.current(data);
          if (!wordWrapRef.current && syncCursorLineCols()) {
            scheduleFit(true);
          }
        });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      onResizeRef.current(cols, rows);
    });

    const resizeTarget = hscrollRef.current ?? host;
    let resizeDebounceTimer = 0;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = window.setTimeout(() => {
        scheduleFit(true);
      }, wordWrapRef.current ? 150 : 50);
    });
    observer.observe(resizeTarget);

    onReadyRef.current?.({
      write: (data: string) => {
        let contentColsChanged = false;
        for (const segment of data.split(/\r?\n/)) {
          const prev = contentColsRef.current;
          contentColsRef.current = updateMaxContentCols(
            contentColsRef.current,
            segment,
          );
          if (contentColsRef.current !== prev) {
            contentColsChanged = true;
          }
        }
        term.write(data);
        if (!wordWrapRef.current && contentColsChanged) {
          scheduleFit(true);
        }
      },
      reset: () => {
        contentColsRef.current = 0;
        term.reset();
        scheduleFit(false);
      },
      fit: () => {
        scheduleFit(true);
      },
      getDimensions: () => ({
        cols: term.cols,
        rows: term.rows,
      }),
      focus: () => {
        term.focus();
      },
    });

    fitTerminal(false);

    return () => {
      cancelAnimationFrame(fitFrameRef.current);
      clearTimeout(resizeDebounceTimer);
      dataDisposable.dispose();
      resizeDisposable.dispose();
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      contentColsRef.current = 0;
    };
  }, [readOnly]);

  useEffect(() => {
    if (!isVisible) return;

    const fit = () => {
      if (!hostRef.current || !fitRef.current || !termRef.current) return;
      try {
        fitAndSyncTerminal(
          hostRef.current,
          termRef.current,
          fitRef.current,
          contentColsRef.current,
          wordWrapRef.current,
        );
        onResizeRef.current(termRef.current.cols, termRef.current.rows);
        termRef.current.focus();
      } catch {
        // ignore
      }
    };

    const timer = window.setTimeout(fit, 50);
    return () => window.clearTimeout(timer);
  }, [isVisible, refitToken, wordWrap]);

  const scrollToBottom = useCallback(() => {
    termRef.current?.scrollToBottom();
  }, []);

  const { visible: showScrollDown, handleClick: handleScrollDown } =
    useTerminalScrollDown(hostRef, scrollToBottom);

  useTerminalWheelTrap(frameRef, wordWrap);

  return (
    <div
      ref={frameRef}
      className={`terminal-viewer-frame${wordWrap ? " is-word-wrap" : ""}`}
    >
      <div ref={hscrollRef} className="terminal-xterm-hscroll">
        <div ref={hostRef} className="server-terminal-xterm-host" />
      </div>
      <TerminalScrollDownButton
        visible={showScrollDown}
        onClick={handleScrollDown}
        hostRef={hostRef}
        tooltip="Scroll to bottom"
      />
    </div>
  );
}
