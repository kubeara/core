import type {
  ServerCpuMetrics,
  ServerDiskMetrics,
  ServerMemoryMetrics,
  ServerNetworkMetrics,
  ServerResourcesMetricsPayload,
  ServerSystemMetrics,
} from "@shared/socket-events";

interface CpuStatSample {
  idle: number;
  total: number;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Parses the aggregate `cpu` line from `/proc/stat`.
 */
export function parseCpuStatLine(line: string): CpuStatSample {
  const cpuLine = line.trim();
  if (!cpuLine.startsWith("cpu ")) {
    throw new Error("Failed to parse CPU stats from /proc/stat");
  }

  const values = cpuLine
    .split(/\s+/)
    .slice(1)
    .map((value) => Number(value));

  if (values.length < 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Failed to parse CPU stats from /proc/stat");
  }

  const idle = values[3] + (values[4] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);

  return { idle, total };
}

/**
 * Computes CPU usage percent from two `/proc/stat` samples.
 */
export function computeCpuUsagePercent(
  start: CpuStatSample,
  end: CpuStatSample,
): number {
  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;

  if (totalDelta <= 0) {
    return 0;
  }

  return roundToOneDecimal(((totalDelta - idleDelta) / totalDelta) * 100);
}

/**
 * Parses load average from `/proc/loadavg`.
 */
export function parseLoadAverage(content: string): [number, number, number] {
  const values = content
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((value) => Number(value));

  if (values.length < 3 || values.some((value) => !Number.isFinite(value))) {
    return [0, 0, 0];
  }

  return [
    roundToOneDecimal(values[0]),
    roundToOneDecimal(values[1]),
    roundToOneDecimal(values[2]),
  ];
}

function parseMeminfoValue(content: string, key: string): number {
  const match = content.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, "m"));
  return match ? Number(match[1]) : 0;
}

/**
 * Parses memory metrics from `/proc/meminfo` (values in bytes).
 */
export function parseMeminfo(content: string): ServerMemoryMetrics {
  const totalKb = parseMeminfoValue(content, "MemTotal");
  const freeKb = parseMeminfoValue(content, "MemFree");
  const availableKb = parseMeminfoValue(content, "MemAvailable") || freeKb;

  const total = totalKb * 1024;
  const free = freeKb * 1024;
  const available = availableKb * 1024;
  const used = Math.max(total - available, 0);
  const usagePercent = total > 0 ? roundToOneDecimal((used / total) * 100) : 0;

  return { total, used, free, available, usagePercent };
}

/**
 * Parses root filesystem metrics from `df -B1 /` output (values in bytes).
 */
export function parseDfOutput(stdout: string): ServerDiskMetrics {
  const lines = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("Unexpected df output format");
  }

  const dataLine = lines[lines.length - 1];
  const columns = dataLine.split(/\s+/);
  if (columns.length < 4) {
    throw new Error("Failed to parse df output columns");
  }

  const total = Number(columns[1]);
  const used = Number(columns[2]);
  const free = Number(columns[3]);

  if (![total, used, free].every((value) => Number.isFinite(value))) {
    throw new Error("Failed to parse df numeric values");
  }

  const usagePercent = total > 0 ? roundToOneDecimal((used / total) * 100) : 0;

  return { total, used, free, usagePercent };
}

/**
 * Counts logical CPUs from `/proc/cpuinfo` (`processor` entries).
 */
export function parseCpuCoresFromCpuinfo(content: string): number {
  const matches = content.match(/^processor\s*:/gm);
  return matches?.length ?? 0;
}

/**
 * Parses the hostname from `/proc/sys/kernel/hostname`.
 */
export function parseHostnameFromProc(content: string): string {
  return content.trim().split("\n")[0]?.trim() ?? "";
}

/**
 * Parses cumulative RX/TX bytes from `/proc/net/dev`.
 */
export function parseNetDev(content: string): ServerNetworkMetrics {
  const lines = content.trim().split("\n").slice(2);

  let rxBytes = 0;
  let txBytes = 0;

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const iface = line.slice(0, colonIndex).trim();
    if (!iface || iface === "lo") {
      continue;
    }

    const fields = line
      .slice(colonIndex + 1)
      .trim()
      .split(/\s+/)
      .map((value) => Number(value));

    if (fields.length < 16 || fields.some((value) => !Number.isFinite(value))) {
      continue;
    }

    rxBytes += fields[0];
    txBytes += fields[8];
  }

  return { rxBytes, txBytes };
}

/**
 * Builds a full resource snapshot from raw Linux command/file output.
 */
export function buildServerResourcesMetrics(input: {
  cpuStatFirstLine: string;
  cpuStatSecondLine: string;
  loadAverageContent: string;
  cpuCores: number;
  meminfo: string;
  dfStdout: string;
  netDev: string;
  uptimeContent: string;
  hostname: string;
  platform: string;
  architecture: string;
  timestamp?: string;
}): ServerResourcesMetricsPayload {
  const start = parseCpuStatLine(input.cpuStatFirstLine);
  const end = parseCpuStatLine(input.cpuStatSecondLine);
  const usagePercent = computeCpuUsagePercent(start, end);

  const cpu: ServerCpuMetrics = {
    usagePercent,
    cores: input.cpuCores,
    loadAverage: parseLoadAverage(input.loadAverageContent),
  };

  const uptimeSeconds = Number(input.uptimeContent.trim().split(/\s+/)[0]);
  const system: ServerSystemMetrics = {
    uptime: Number.isFinite(uptimeSeconds) ? uptimeSeconds : 0,
    hostname: input.hostname.trim(),
    platform: input.platform.trim(),
    architecture: input.architecture.trim(),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };

  return {
    cpu,
    memory: parseMeminfo(input.meminfo),
    disk: parseDfOutput(input.dfStdout),
    network: parseNetDev(input.netDev),
    system,
  };
}
