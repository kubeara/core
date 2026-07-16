/** Default terminal width in columns (xterm standard). */
export const DEFAULT_TERMINAL_COLS = 80;

/** Default terminal height in rows (xterm standard). */
export const DEFAULT_TERMINAL_ROWS = 24;

/** TERM value used for PTY and SSH shell sessions. */
export const TERMINAL_TERM_TYPE = "xterm-256color";

/** COLORTERM value for truecolor terminal support. */
export const TERMINAL_COLOR_TERM = "truecolor";

/** Minimum allowed terminal column count. */
export const MIN_TERMINAL_COLS = 10;

/** Maximum allowed terminal column count. */
export const MAX_TERMINAL_COLS = 500;

/** Minimum allowed terminal row count. */
export const MIN_TERMINAL_ROWS = 5;

/** Maximum allowed terminal row count. */
export const MAX_TERMINAL_ROWS = 200;

/** Prefix for SSH fallback terminal connection ids. */
export const SSH_TERMINAL_CONNECTION_ID_PREFIX = "terminal-";

/** SSH shell window pixel dimensions (unused by xterm; set to zero). */
export const SSH_TERMINAL_WINDOW_PIXELS = {
  WIDTH: 0,
  HEIGHT: 0,
} as const;

/** Text encoding used when relaying SSH stream output. */
export const TERMINAL_OUTPUT_ENCODING = "utf8" as const;
