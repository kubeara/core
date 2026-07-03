/** Common shell executable paths on Linux hosts. */
export const SHELL_PATHS = {
  BASH: "/bin/bash",
  SH: "/bin/sh",
} as const;

/** Defaults for child_process exec/spawn on remote and local hosts. */
export const EXEC_DEFAULTS = {
  MAX_BUFFER_BYTES: 16 * 1024 * 1024,
} as const;
