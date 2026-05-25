import { apiFetch } from "@/lib/api-client";
import { assertOk } from "@/lib/api-error";
import type { Server, ServerStatus } from "@/lib/types";

export async function fetchServers(): Promise<Server[]> {
  const res = await apiFetch("/api/servers");
  await assertOk(res);
  const data = (await res.json()) as { servers: Server[] };
  return data.servers ?? [];
}

export async function fetchServer(id: string): Promise<Server> {
  const res = await apiFetch(`/api/servers/${id}`);
  await assertOk(res);
  const data = (await res.json()) as { server: Server };
  return data.server;
}

export type ServerInput = {
  name: string;
  username: string;
  host: string;
  status: ServerStatus;
};

export async function createServer(input: ServerInput): Promise<Server> {
  const res = await apiFetch("/api/servers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  await assertOk(res);
  const data = (await res.json()) as { server: Server };
  return data.server;
}

export async function updateServer(
  id: string,
  input: Partial<ServerInput>,
): Promise<Server> {
  const res = await apiFetch(`/api/servers/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  await assertOk(res);
  const data = (await res.json()) as { server: Server };
  return data.server;
}

export async function deleteServer(id: string): Promise<void> {
  const res = await apiFetch(`/api/servers/${id}`, { method: "DELETE" });
  await assertOk(res);
}
