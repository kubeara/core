import { describe, expect, it } from "@jest/globals";

import {
  buildServerResourcesMetrics,
  computeCpuUsagePercent,
  parseCpuCoresFromCpuinfo,
  parseCpuStatLine,
  parseHostnameFromProc,
  parseMeminfo,
  parseNetDev,
} from "./parse-server-resources.util";

describe("parse-server-resources.util", () => {
  it("parses aggregate cpu line from /proc/stat", () => {
    const sample = parseCpuStatLine("cpu  3357 0 4313 1362373 0 0 0 0 0 0");

    expect(sample.idle).toBe(1362373);
    expect(sample.total).toBe(1370043);
  });

  it("computes CPU usage percent from two samples", () => {
    const start = parseCpuStatLine("cpu  0 0 0 9000 0 0 0 0 0 0");
    const end = parseCpuStatLine("cpu  0 0 100 9900 0 0 0 0 0 0");

    expect(computeCpuUsagePercent(start, end)).toBe(10);
  });

  it("returns zero CPU usage when jiffies do not advance", () => {
    const sample = parseCpuStatLine("cpu  1000 0 1000 7000 0 0 0 0 0 0");

    expect(computeCpuUsagePercent(sample, sample)).toBe(0);
  });

  it("parses memory usage from meminfo", () => {
    const meminfo = [
      "MemTotal:       8000000 kB",
      "MemFree:        2000000 kB",
      "MemAvailable:   4000000 kB",
    ].join("\n");

    expect(parseMeminfo(meminfo)).toEqual({
      total: 8_000_000 * 1024,
      used: 4_000_000 * 1024,
      free: 2_000_000 * 1024,
      available: 4_000_000 * 1024,
      usagePercent: 50,
    });
  });

  it("sums non-loopback interfaces from /proc/net/dev", () => {
    const netDev = [
      "Inter-|   Receive                                                |  Transmit",
      " face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed",
      "    lo: 1000       10    0    0    0     0          0         0     1000       10    0    0    0     0       0          0",
      "  eth0: 5000       50    0    0    0     0          0         0     7000       70    0    0    0     0       0          0",
    ].join("\n");

    expect(parseNetDev(netDev)).toEqual({ rxBytes: 5000, txBytes: 7000 });
  });

  it("counts processors and hostname from proc files", () => {
    const cpuinfo = [
      "processor\t: 0",
      "model name\t: Test CPU",
      "processor\t: 1",
      "model name\t: Test CPU",
    ].join("\n");

    expect(parseCpuCoresFromCpuinfo(cpuinfo)).toBe(2);
    expect(parseHostnameFromProc("my-server\n")).toBe("my-server");
  });

  it("builds a full metrics snapshot", () => {
    const metrics = buildServerResourcesMetrics({
      cpuStatFirstLine: "cpu  0 0 0 9000 0 0 0 0 0 0",
      cpuStatSecondLine: "cpu  0 0 100 9900 0 0 0 0 0 0",
      loadAverageContent: "0.42 0.35 0.30 1/200 999",
      cpuCores: 4,
      meminfo: "MemTotal:       1000 kB\nMemFree:        500 kB\n",
      dfStdout:
        "Filesystem     1B-blocks       Used   Available Use% Mounted on\n/dev/sda1 1000000000 250000000 750000000  20% /",
      netDev: [
        "Inter-|   Receive                                                |  Transmit",
        " face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed",
        "  eth0: 100 1 0 0 0 0 0 0 200 2 0 0 0 0 0 0",
      ].join("\n"),
      uptimeContent: "86400.00 172800.00",
      hostname: "server-a",
      platform: "linux",
      architecture: "x86_64",
      timestamp: "2026-06-12T12:00:00.000Z",
    });

    expect(metrics.cpu.usagePercent).toBe(10);
    expect(metrics.cpu.cores).toBe(4);
    expect(metrics.memory.usagePercent).toBe(50);
    expect(metrics.disk.usagePercent).toBe(25);
    expect(metrics.network).toEqual({ rxBytes: 100, txBytes: 200 });
    expect(metrics.system.uptime).toBe(86400);
    expect(metrics.system.hostname).toBe("server-a");
  });
});
