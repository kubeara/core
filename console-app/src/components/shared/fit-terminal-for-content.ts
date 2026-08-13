import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";

const ESC = "\u001b";
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESC}\\[[0-9;]*[ -/]*[@-~]`, "g");
const CONTENT_COL_PADDING = 2;
const MIN_TERMINAL_COLS = 2;

export function visibleTerminalTextWidth(text: string): number {
  return text.replace(ANSI_ESCAPE_PATTERN, "").length;
}

export function contentColsForTerminalText(text: string): number {
  return visibleTerminalTextWidth(text) + CONTENT_COL_PADDING;
}

export function updateMaxContentCols(current: number, text: string): number {
  return Math.max(current, contentColsForTerminalText(text));
}

export function getMaxColsFromTerminalBuffer(term: Terminal): number {
  const buffer = term.buffer.active;
  let max = MIN_TERMINAL_COLS;

  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (!line) continue;

    const lineText = line.translateToString(false);
    if (lineText.length === 0) continue;

    max = Math.max(max, contentColsForTerminalText(lineText));
  }

  return max;
}

function getTerminalScrollContainer(host: HTMLElement): HTMLElement | null {
  const container = host.closest(".terminal-xterm-hscroll");
  return container instanceof HTMLElement ? container : null;
}

function getHostHorizontalPadding(host: HTMLElement): number {
  const style = window.getComputedStyle(host);
  return (
    parseFloat(style.paddingLeft) +
    parseFloat(style.paddingRight) +
    parseFloat(style.borderLeftWidth) +
    parseFloat(style.borderRightWidth)
  );
}

function clearHostWidthOverrides(host: HTMLElement): void {
  host.style.width = "";
  host.style.minWidth = "";
  host.style.maxWidth = "";
  host.style.height = "";
}

function resetHostToViewportWidth(
  host: HTMLElement,
  viewportWidth: number,
): void {
  host.style.width = `${viewportWidth}px`;
  host.style.minWidth = `${viewportWidth}px`;
  host.style.maxWidth = `${viewportWidth}px`;
  host.style.height = "100%";
}

function applyHostContentWidth(
  host: HTMLElement,
  scrollContainer: HTMLElement,
  viewportWidth: number,
  contentCols: number,
  viewportCols: number,
): void {
  const padding = getHostHorizontalPadding(host);
  const screen = host.querySelector(".xterm-screen");
  const screenWidth = screen?.getBoundingClientRect().width ?? 0;
  const neededWidth = Math.max(
    viewportWidth,
    Math.ceil(screenWidth + padding),
  );

  if (contentCols <= viewportCols || neededWidth <= viewportWidth + 1) {
    resetHostToViewportWidth(host, viewportWidth);
    scrollContainer.scrollLeft = 0;
    return;
  }

  host.style.minWidth = `${viewportWidth}px`;
  host.style.maxWidth = "none";
  host.style.width = `${neededWidth}px`;
  host.style.height = "100%";
}

function resizeFromFitProposal(
  term: Terminal,
  fitAddon: FitAddon,
): boolean {
  const proposed = safeProposeDimensions(fitAddon);
  if (!proposed) {
    return false;
  }

  if (term.cols === proposed.cols && term.rows === proposed.rows) {
    return false;
  }

  term.resize(proposed.cols, proposed.rows);
  return true;
}

/**
 * FitAddon.proposeDimensions() can throw when xterm's render service is not
 * ready yet (`dimensions` undefined) — e.g. hidden log panes on deploy logs.
 */
function safeProposeDimensions(
  fitAddon: FitAddon,
): { cols: number; rows: number } | undefined {
  try {
    const proposed = fitAddon.proposeDimensions();
    if (
      !proposed ||
      Number.isNaN(proposed.cols) ||
      Number.isNaN(proposed.rows) ||
      proposed.cols < MIN_TERMINAL_COLS ||
      proposed.rows < 1
    ) {
      return undefined;
    }
    return proposed;
  } catch {
    return undefined;
  }
}

export function fitAndSyncTerminal(
  host: HTMLElement,
  term: Terminal,
  fitAddon: FitAddon,
  contentCols = 0,
  wordWrap = true,
): void {
  const scrollContainer = getTerminalScrollContainer(host);

  if (wordWrap) {
    clearHostWidthOverrides(host);
    if (scrollContainer) {
      scrollContainer.scrollLeft = 0;
    }

    resizeFromFitProposal(term, fitAddon);
    return;
  }

  if (!scrollContainer) {
    const proposed = safeProposeDimensions(fitAddon);
    if (!proposed) {
      return;
    }

    const cols = Math.max(MIN_TERMINAL_COLS, proposed.cols, contentCols);
    if (term.cols !== cols || term.rows !== proposed.rows) {
      term.resize(cols, proposed.rows);
    }
    return;
  }

  const viewportWidth = scrollContainer.clientWidth;
  if (viewportWidth <= 0) {
    return;
  }

  resetHostToViewportWidth(host, viewportWidth);

  const proposed = safeProposeDimensions(fitAddon);
  if (!proposed) {
    return;
  }

  const viewportCols = proposed.cols;
  const terminalCols = Math.max(MIN_TERMINAL_COLS, viewportCols, contentCols);
  const rows = proposed.rows;

  if (term.cols !== terminalCols || term.rows !== rows) {
    term.resize(terminalCols, rows);
  }

  const syncWidth = () => {
    applyHostContentWidth(
      host,
      scrollContainer,
      viewportWidth,
      contentCols,
      viewportCols,
    );
  };

  syncWidth();
  requestAnimationFrame(syncWidth);
}
