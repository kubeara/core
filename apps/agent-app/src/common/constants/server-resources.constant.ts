/** Interval between `/proc/stat` samples when computing CPU usage. */
export const CPU_SAMPLE_INTERVAL_MS = 100;

/** Maximum time allowed for the full resource collection cycle. */
export const SERVER_RESOURCES_TIMEOUT_MS = 8_000;

/** Maximum time allowed for `df -B1 /`. */
export const DF_COMMAND_TIMEOUT_MS = 5_000;
