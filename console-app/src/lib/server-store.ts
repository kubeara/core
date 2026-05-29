import { randomBytes } from "crypto";
import type { Server, ServerStatus } from "@/types";

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
  status: ServerStatus;
}): Server {
  const server: Server = {
    id: generateId(),
    name: input.name.trim(),
    username: input.username.trim(),
    host: input.host.trim(),
    status: input.status,
    createdAt: new Date().toISOString(),
  };
  servers.set(server.id, server);
  return server;
}

export function updateServer(
  id: string,
  input: Partial<Pick<Server, "name" | "username" | "host" | "status">>,
): Server | null {
  const existing = servers.get(id);
  if (!existing) return null;

  const updated: Server = {
    ...existing,
    name: input.name?.trim() ?? existing.name,
    username: input.username?.trim() ?? existing.username,
    host: input.host?.trim() ?? existing.host,
    status: input.status ?? existing.status,
  };
  servers.set(id, updated);
  return updated;
}

export function deleteServer(id: string): boolean {
  return servers.delete(id);
}

function seedServers() {
  if (servers.size > 0) return;

  const seed: Omit<Server, "id" | "createdAt">[] = [
    {
      name: "Production API",
      username: "deploy",
      host: "api.prod.kubeara.io",
      status: "online",
    },
    {
      name: "Staging Cluster",
      username: "admin",
      host: "staging.internal.local",
      status: "online",
    },
    {
      name: "Dev Sandbox",
      username: "devuser",
      host: "192.168.1.42",
      status: "offline",
    },
    {
      name: "Legacy DB Host",
      username: "postgres",
      host: "db-legacy.example.com",
      status: "pending",
    },
    {
      name: "CI Runner",
      username: "ci-bot",
      host: "runner-01.ci.kubeara.io",
      status: "error",
    },
    {
      name: "Analytics Node",
      username: "analytics",
      host: "analytics-east.kubeara.io",
      status: "online",
    },
    {
      name: "Backup Server",
      username: "backup",
      host: "backup-02.kubeara.io",
      status: "offline",
    },
    {
      name: "Edge Gateway",
      username: "gateway",
      host: "edge.us-west.kubeara.io",
      status: "online",
    },
    {
      name: "Test VM",
      username: "test",
      host: "10.0.0.15",
      status: "pending",
    },
    {
      name: "Monitoring",
      username: "monitor",
      host: "grafana.kubeara.io",
      status: "online",
    },
    {
      name: "Queue Worker",
      username: "worker",
      host: "queue.internal.local",
      status: "offline",
    },
    {
      name: "Archive Node",
      username: "archive",
      host: "archive.kubeara.io",
      status: "online",
    },
  ];

  for (const item of seed) {
    createServer(item);
  }
}

seedServers();
