/** Delimiters used in the bundled host metrics shell script output. */
export const HOST_RESOURCES_SECTION = {
  MEM: "---KUBEARA_MEM---",
  DF: "---KUBEARA_DF---",
  NET: "---KUBEARA_NET---",
  UPTIME: "---KUBEARA_UPTIME---",
  LOAD: "---KUBEARA_LOAD---",
  HOST: "---KUBEARA_HOST---",
} as const;

/** Timeout for the bundled host metrics shell script over SSH/local. */
export const HOST_RESOURCES_COMMAND_TIMEOUT_MS = 12_000;

/**
 * Collects host metrics in one shell invocation (CPU sample, meminfo, df, net, uptime).
 * Uses only Linux built-ins and /proc.
 */
/** Single-line script for SSH/local execution (newlines break JSON-quoted bash -lc). */
export const HOST_RESOURCES_SHELL_COMMAND = [
  "set -e",
  "head -1 /proc/stat",
  "sleep 1",
  "head -1 /proc/stat",
  `echo '${HOST_RESOURCES_SECTION.MEM}'`,
  "cat /proc/meminfo",
  `echo '${HOST_RESOURCES_SECTION.DF}'`,
  "df -B1 /",
  `echo '${HOST_RESOURCES_SECTION.NET}'`,
  "cat /proc/net/dev",
  `echo '${HOST_RESOURCES_SECTION.UPTIME}'`,
  "cat /proc/uptime",
  `echo '${HOST_RESOURCES_SECTION.LOAD}'`,
  "cat /proc/loadavg",
  `echo '${HOST_RESOURCES_SECTION.HOST}'`,
  "hostname",
  "uname -s",
  "uname -m",
  "nproc",
].join("; ");
