import { templates } from "./templates";
import type { Template } from "@/types";

export type ConnectedService = {
  templateId: string;
  name: string;
  category: string;
  color: string;
  status: "running" | "stopped" | "degraded";
  version: string;
  port: number;
};

export type ActivityEntry = {
  id: string;
  kind: "deploy" | "restart" | "config" | "alert" | "scale";
  title: string;
  detail: string;
  timestamp: string;
};

export type MetricSeries = {
  label: string;
  value: number;
  unit: string;
  peak: number;
  points: number[];
};

export type ServerInsights = {
  bandwidth: MetricSeries;
  cpu: MetricSeries;
  diskIo: MetricSeries;
};

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function seededRandom(seed: number, index: number): number {
  const x = Math.sin(seed * 9999 + index * 127) * 10000;
  return x - Math.floor(x);
}

function buildSeries(seed: number, count: number, min: number, max: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = seededRandom(seed, i);
    return Math.round(min + t * (max - min));
  });
}

const VERSIONS = ["1.2.4", "2.0.1", "3.4.0", "14.2", "7.1.0", "6.2.8"];
const PORTS = [5432, 6379, 27017, 5672, 9092, 9200, 9000, 3000, 80, 443];

export function getConnectedServices(serverId: string): ConnectedService[] {
  const seed = hashString(serverId);
  const count = 3 + (seed % 4);
  const picked = new Set<number>();

  while (picked.size < count && picked.size < templates.length) {
    picked.add((seed + picked.size * 7) % templates.length);
  }

  const statuses: ConnectedService["status"][] = ["running", "running", "degraded", "stopped"];

  return [...picked].map((idx, i) => {
    const t = templates[idx];
    return {
      templateId: t.id,
      name: t.name,
      category: t.category,
      color: t.color,
      status: statuses[(seed + i) % statuses.length],
      version: VERSIONS[(seed + i) % VERSIONS.length],
      port: PORTS[(seed + i) % PORTS.length],
    };
  });
}

export function getAllTemplatesForServer(): Template[] {
  return templates;
}

export function getServerInsights(serverId: string): ServerInsights {
  const seed = hashString(serverId);
  const bandwidthPoints = buildSeries(seed, 24, 12, 98);
  const cpuPoints = buildSeries(seed + 1, 24, 8, 92);
  const diskPoints = buildSeries(seed + 2, 24, 5, 75);

  const bandwidthCurrent = bandwidthPoints[bandwidthPoints.length - 1] ?? 0;
  const cpuCurrent = cpuPoints[cpuPoints.length - 1] ?? 0;
  const diskCurrent = diskPoints[diskPoints.length - 1] ?? 0;

  return {
    bandwidth: {
      label: "Bandwidth",
      value: bandwidthCurrent,
      unit: "Mbps",
      peak: Math.max(...bandwidthPoints),
      points: bandwidthPoints,
    },
    cpu: {
      label: "CPU usage",
      value: cpuCurrent,
      unit: "%",
      peak: Math.max(...cpuPoints),
      points: cpuPoints,
    },
    diskIo: {
      label: "Disk I/O",
      value: diskCurrent,
      unit: "MB/s",
      peak: Math.max(...diskPoints),
      points: diskPoints,
    },
  };
}

export function getServerActivity(serverId: string, serverName: string): ActivityEntry[] {
  const seed = hashString(serverId);
  const now = Date.now();

  const events: Omit<ActivityEntry, "id" | "timestamp">[] = [
    {
      kind: "deploy",
      title: "Service deployed",
      detail: "PostgreSQL stack rolled out successfully.",
    },
    {
      kind: "restart",
      title: "Container restarted",
      detail: "Redis pod restarted after health check recovery.",
    },
    {
      kind: "config",
      title: "Configuration updated",
      detail: "Connection pool limits adjusted for peak traffic.",
    },
    {
      kind: "scale",
      title: "Resources scaled",
      detail: "CPU limit increased from 2 to 4 cores.",
    },
    {
      kind: "alert",
      title: "Alert resolved",
      detail: "High memory usage alert cleared on monitoring agent.",
    },
    {
      kind: "deploy",
      title: "Template linked",
      detail: `New template attached to ${serverName}.`,
    },
    {
      kind: "config",
      title: "Firewall rule added",
      detail: "Inbound traffic restricted to VPC subnet 10.0.0.0/16.",
    },
  ];

  return events.map((event, i) => {
    const hoursAgo = (seed % 5) + i * ((seed % 3) + 2);
    return {
      ...event,
      id: `${serverId}-activity-${i}`,
      timestamp: new Date(now - hoursAgo * 60 * 60 * 1000).toISOString(),
    };
  });
}

