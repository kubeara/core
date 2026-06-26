import { existsSync } from "node:fs";
import {
  SHELL_PATHS,
  TERMINAL_COLOR_TERM,
  TERMINAL_TERM_TYPE,
} from "@shared/common";

export {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  TERMINAL_TERM_TYPE,
} from "@shared/common";

export const TERMINAL_SHELL = existsSync(SHELL_PATHS.BASH)
  ? SHELL_PATHS.BASH
  : SHELL_PATHS.SH;

export const TERMINAL_ENV = {
  ...process.env,
  TERM: TERMINAL_TERM_TYPE,
  COLORTERM: TERMINAL_COLOR_TERM,
} as NodeJS.ProcessEnv;
