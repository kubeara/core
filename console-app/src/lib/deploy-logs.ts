import { waitMs } from "./async-delay";

export type DeployLogLevel = "info" | "success" | "warn" | "error";

export type DeployLogEntry = {
  level: DeployLogLevel;
  message: string;
};

export function buildDeployLogSequence(
  templateId: string,
  templateName: string,
): DeployLogEntry[] {
  const id = templateId.toLowerCase();
  const base: DeployLogEntry[] = [
    { level: "info", message: `Starting deployment for ${templateName}…` },
    { level: "info", message: "Validating cluster credentials…" },
    { level: "success", message: "Cluster connection established." },
    { level: "info", message: `Pulling ${templateName} Helm chart…` },
    { level: "info", message: "Rendering Kubernetes manifests…" },
    { level: "info", message: "Creating namespace kubeara-apps…" },
    { level: "success", message: "Namespace ready." },
    { level: "info", message: `Applying ${id} StatefulSet and Services…` },
    { level: "info", message: "Waiting for pods to become ready…" },
  ];

  const extras: Record<string, DeployLogEntry[]> = {
    postgresql: [
      { level: "info", message: "Initializing PostgreSQL data directory…" },
      { level: "info", message: "Running initdb and configuring pg_hba.conf…" },
      { level: "success", message: "PostgreSQL accepting connections on :5432." },
    ],
    mongodb: [
      { level: "info", message: "Starting MongoDB replica set initiation…" },
      { level: "success", message: "Replica set PRIMARY elected." },
    ],
    redis: [
      { level: "info", message: "Loading Redis AOF persistence config…" },
      { level: "success", message: "Redis PING → PONG." },
    ],
    n8n: [
      { level: "info", message: "Migrating n8n database schema…" },
      { level: "info", message: "Registering webhook endpoints…" },
      { level: "success", message: "n8n UI available on port 5678." },
    ],
  };

  const specific = extras[id] ?? [
    { level: "info", message: `Configuring ${templateName} runtime…` },
    { level: "success", message: `${templateName} health check passed.` },
  ];

  return [
    ...base,
    ...specific,
    { level: "info", message: "Running post-deploy smoke tests…" },
    { level: "success", message: "All smoke tests passed." },
    { level: "success", message: `Deployment of ${templateName} completed successfully.` },
  ];
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return waitMs(ms, signal);
}
