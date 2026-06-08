import { buildServerResourcesMetrics } from "@shared/common";
import type { ServerResourcesMetricsPayload } from "@shared/socket-events";

import { HOST_RESOURCES_SECTION } from "../constants/server-resources.constants";

function section(content: string, marker: string, nextMarker?: string): string {
  const start = content.indexOf(marker);
  if (start === -1) {
    throw new Error(`Missing host resources section: ${marker}`);
  }

  const from = start + marker.length;
  const end = nextMarker ? content.indexOf(nextMarker, from) : content.length;
  if (end === -1) {
    throw new Error(`Malformed host resources section after: ${marker}`);
  }

  return content.slice(from, end).trim();
}

/**
 * Parses bundled host metrics shell output into a resource snapshot.
 */
export function parseHostResourcesOutput(
  stdout: string,
): ServerResourcesMetricsPayload {
  const lines = stdout.trim().split("\n");
  const cpuStatFirstLine = lines[0]?.trim() ?? "";
  const cpuStatSecondLine = lines[1]?.trim() ?? "";

  if (!cpuStatFirstLine || !cpuStatSecondLine) {
    throw new Error("Failed to read CPU stats from host /proc/stat");
  }

  const meminfo = section(
    stdout,
    HOST_RESOURCES_SECTION.MEM,
    HOST_RESOURCES_SECTION.DF,
  );
  const dfStdout = section(
    stdout,
    HOST_RESOURCES_SECTION.DF,
    HOST_RESOURCES_SECTION.NET,
  );
  const netDev = section(
    stdout,
    HOST_RESOURCES_SECTION.NET,
    HOST_RESOURCES_SECTION.UPTIME,
  );
  const uptimeContent = section(
    stdout,
    HOST_RESOURCES_SECTION.UPTIME,
    HOST_RESOURCES_SECTION.LOAD,
  );
  const loadAverageContent = section(
    stdout,
    HOST_RESOURCES_SECTION.LOAD,
    HOST_RESOURCES_SECTION.HOST,
  );
  const hostSection = section(stdout, HOST_RESOURCES_SECTION.HOST);
  const hostLines = hostSection.split("\n").map((line) => line.trim());

  const hostname = hostLines[0] ?? "";
  const platform = hostLines[1] ?? "linux";
  const architecture = hostLines[2] ?? "";
  const cpuCores = Number(hostLines[3] ?? "0");

  return buildServerResourcesMetrics({
    cpuStatFirstLine,
    cpuStatSecondLine,
    loadAverageContent,
    cpuCores: Number.isFinite(cpuCores) && cpuCores > 0 ? cpuCores : 1,
    meminfo,
    dfStdout,
    netDev,
    uptimeContent,
    hostname,
    platform,
    architecture,
  });
}
