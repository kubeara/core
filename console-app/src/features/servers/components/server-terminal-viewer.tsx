import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  KUBEARA_TERMINAL_FONT,
  KUBEARA_TERMINAL_THEME,
} from "@/components/shared/kubeara-terminal-theme";
import { TerminalScrollDownButton } from "@/components/shared/terminal-scroll-down-button";
import { useTerminalScrollDown } from "@/components/shared/use-terminal-scroll-down";
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
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
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
        fitRef.current.fit();
        if (notifyRemote) {
          onResizeRef.current(term.cols, term.rows);
        }
      } catch {
        // hidden containers cannot be measured yet
      }
    };

    const dataDisposable = readOnly
      ? { dispose: () => undefined }
      : term.onData((data) => {
          onDataRef.current(data);
        });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      onResizeRef.current(cols, rows);
    });

    const observer = new ResizeObserver(() => {
      fitTerminal(true);
    });
    observer.observe(host);

    onReadyRef.current?.({
      write: (data: string) => {
        term.write(data);
      },
      reset: () => {
        term.reset();
      },
      fit: () => {
        fitTerminal(true);
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
      dataDisposable.dispose();
      resizeDisposable.dispose();
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [readOnly]);

  useEffect(() => {
    if (!isVisible) return;

    const fit = () => {
      try {
        fitRef.current?.fit();
        if (termRef.current) {
          onResizeRef.current(termRef.current.cols, termRef.current.rows);
        }
        termRef.current?.focus();
      } catch {
        // ignore
      }
    };

    const timer = window.setTimeout(fit, 50);
    return () => window.clearTimeout(timer);
  }, [isVisible, refitToken]);

  const scrollToBottom = useCallback(() => {
    termRef.current?.scrollToBottom();
  }, []);

  const { visible: showScrollDown, handleClick: handleScrollDown } =
    useTerminalScrollDown(hostRef, scrollToBottom);

  return (
    <div className="terminal-viewer-frame">
      <div ref={hostRef} className="server-terminal-xterm-host" />
      <TerminalScrollDownButton
        visible={showScrollDown}
        onClick={handleScrollDown}
        hostRef={hostRef}
        tooltip="Scroll to bottom"
      />
    </div>
  );
}
