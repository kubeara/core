import { waitMs } from "@/lib/async-delay";
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
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onReady?: (api: ServerTerminalViewerApi) => void;
};

export function ServerTerminalViewer({
  isVisible,
  refitToken = 0,
  readOnly = false,
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

  onDataRef.current = onData;
  onResizeRef.current = onResize;
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      theme: KUBEARA_TERMINAL_THEME,
      fontFamily: KUBEARA_TERMINAL_FONT,
      fontSize: 14,
      lineHeight: 1.4,
      letterSpacing: 0.2,
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
          if (syncCursorLineCols()) {
            scheduleFit(true);
          }
        });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      onResizeRef.current(cols, rows);
    });

    const resizeTarget = hscrollRef.current ?? host;
    const observer = new ResizeObserver(() => {
      scheduleFit(true);
    });
    observer.observe(resizeTarget);

    onReadyRef.current?.({
      write: (data: string) => {
        for (const segment of data.split(/\r?\n/)) {
          contentColsRef.current = updateMaxContentCols(
            contentColsRef.current,
            segment,
          );
        }
        term.write(data);
        scheduleFit(true);
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
        );
        onResizeRef.current(termRef.current.cols, termRef.current.rows);
        termRef.current.focus();
      } catch {
        // ignore
      }
    };

    const controller = new AbortController();

    void waitMs(50, controller.signal)
      .then(() => {
        fit();
      })
      .catch(() => {});

    return () => {
      controller.abort();
    };
  }, [isVisible, refitToken]);

  const scrollToBottom = useCallback(() => {
    termRef.current?.scrollToBottom();
  }, []);

  const { visible: showScrollDown, handleClick: handleScrollDown } =
    useTerminalScrollDown(hostRef, scrollToBottom);

  useTerminalWheelTrap(frameRef);

  return (
    <div ref={frameRef} className="terminal-viewer-frame">
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
