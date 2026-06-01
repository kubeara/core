import { randomBytes } from "crypto";
import type { Server } from "@/types";

const servers = new Map<string, Server>();

function generateId(): string {
  return `srv_${randomBytes(4).toString("hex")}`;
}

export function listServers(): Server[] {
  return Array.from(servers.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getServerById(id: string): Server | undefined {
  return servers.get(id);
}

export function createServer(input: {
  name: string;
  username: string;
  host: string;
  connected?: boolean;
}): Server {
  const now = new Date().toISOString();
  const server: Server = {
    id: generateId(),
    name: input.name.trim(),
    username: input.username.trim(),
    host: input.host.trim(),
    connected: input.connected ?? false,
    createdAt: now,
    lastConnectedAt: now,
  };
  servers.set(server.id, server);
  return server;
}

export function updateServer(
  id: string,
  input: Partial<Pick<Server, "name" | "username" | "host" | "connected">>,
): Server | null {
  const existing = servers.get(id);
  if (!existing) return null;

  const updated: Server = {
    ...existing,
    name: input.name?.trim() ?? existing.name,
    username: input.username?.trim() ?? existing.username,
    host: input.host?.trim() ?? existing.host,
    connected: input.connected ?? existing.connected,
  };
  servers.set(id, updated);
  return updated;
}

export function deleteServer(id: string): boolean {
  return servers.delete(id);
}

function seedServers() {
  if (servers.size > 0) return;

  const seed: Omit<Server, "id" | "createdAt" | "lastConnectedAt">[] = [
    {
      name: "Production API",
      username: "deploy",
      host: "api.prod.kubeara.io",
      connected: true,
    },
    {
      name: "Staging Cluster",
      username: "admin",
      host: "staging.internal.local",
      connected: true,
    },
    {
      name: "Dev Sandbox",
      username: "devuser",
      host: "192.168.1.42",
      connected: false,
    },
    {
      name: "Legacy DB Host",
      username: "postgres",
      host: "db-legacy.example.com",
      connected: false,
    },
    {
      name: "CI Runner",
      username: "ci-bot",
      host: "runner-01.ci.kubeara.io",
      connected: false,
    },
    {
      name: "Analytics Node",
      username: "analytics",
      host: "analytics-east.kubeara.io",
      connected: true,
    },
    {
      name: "Backup Server",
      username: "backup",
      host: "backup-02.kubeara.io",
      connected: false,
    },
    {
      name: "Edge Gateway",
      username: "gateway",
      host: "edge.us-west.kubeara.io",
      connected: true,
    },
    {
      name: "Test VM",
      username: "test",
      host: "10.0.0.15",
      connected: false,
    },
    {
      name: "Monitoring",
      username: "monitor",
      host: "grafana.kubeara.io",
      connected: true,
    },
    {
      name: "Queue Worker",
      username: "worker",
      host: "queue.internal.local",
      connected: false,
    },
    {
      name: "Archive Node",
      username: "archive",
      host: "archive.kubeara.io",
      connected: true,
    },
  ];

  for (const item of seed) {
    createServer(item);
  }
}

seedServers();
