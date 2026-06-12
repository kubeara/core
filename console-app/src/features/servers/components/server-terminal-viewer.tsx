import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

/** AWS CloudShell-inspired palette */
const AWS_TERMINAL_THEME = {
  background: "#0f1b2a",
  foreground: "#f2f3f3",
  cursor: "#ff9900",
  cursorAccent: "#0f1b2a",
  selectionBackground: "rgba(255, 153, 0, 0.28)",
  selectionForeground: "#ffffff",
  black: "#0f1b2a",
  red: "#ff5d64",
  green: "#7ae582",
  yellow: "#ff9900",
  blue: "#42b4ff",
  magenta: "#c49bff",
  cyan: "#56d6db",
  white: "#f2f3f3",
  brightBlack: "#687078",
  brightRed: "#ff8a90",
  brightGreen: "#9ef0a9",
  brightYellow: "#ffb84d",
  brightBlue: "#7ec8ff",
  brightMagenta: "#d9b8ff",
  brightCyan: "#7ee8ec",
  brightWhite: "#ffffff",
};

export type ServerTerminalViewerApi = {
  write: (data: string) => void;
  reset: () => void;
  fit: () => void;
  getDimensions: () => { cols: number; rows: number };
  focus: () => void;
};

type ServerTerminalViewerProps = {
  isVisible: boolean;
  refitToken: number;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onReady?: (api: ServerTerminalViewerApi) => void;
};

export function ServerTerminalViewer({
  isVisible,
  refitToken,
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
      theme: AWS_TERMINAL_THEME,
      fontFamily:
        '"Geist Mono", "JetBrains Mono", "Cascadia Code", ui-monospace, monospace',
      fontSize: 14,
      lineHeight: 1.4,
      letterSpacing: 0.2,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 10000,
      convertEol: false,
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

    const dataDisposable = term.onData((data) => {
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
  }, []);

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

  return <div ref={hostRef} className="server-terminal-xterm-host" />;
}
