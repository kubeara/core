import { existsSync } from "node:fs";

export const DEFAULT_TERMINAL_COLS = 80;
export const DEFAULT_TERMINAL_ROWS = 24;

export const TERMINAL_SHELL = existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh";

export const TERMINAL_ENV = {
  ...process.env,
  TERM: "xterm-256color",
  COLORTERM: "truecolor",
} as NodeJS.ProcessEnv;
