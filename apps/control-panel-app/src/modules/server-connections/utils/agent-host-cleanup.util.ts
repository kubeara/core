import { AGENT_INSTALL } from "../constants/agent-install.constants";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Compose project name used when the agent stack is installed (basename of REMOTE_DIR).
 */
export function resolveAgentComposeProjectName(
  installDir: string = AGENT_INSTALL.REMOTE_DIR,
): string {
  const base = installDir.replace(/\/+$/, "").split("/").filter(Boolean).pop();
  const normalized = (base ?? "agent")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  return normalized || "agent";
}

/**
 * Removes kubeara-agent containers that use compose-prefixed names (e.g. 62d288a0f1b9_kubeara-agent).
 *
 * @returns Shell script that deletes every container whose name contains kubeara-agent but is not exactly kubeara-agent.
 */
export function buildRemoveOrphanAgentContainersShellCommand(): string {
  const containerName = AGENT_INSTALL.CONTAINER_NAME;

  return [
    `for cid in $(docker ps -aq --filter ${shellQuote(`name=${containerName}`)} 2>/dev/null); do`,
    `  name=$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##')`,
    `  if [ "$name" != "${containerName}" ]; then`,
    `    docker rm -f "$cid" >/dev/null 2>&1 || true`,
    `  fi`,
    `done`,
  ].join(" ");
}

/**
 * Removes stopped or broken canonical kubeara-agent containers before a fresh compose up.
 *
 * @returns Shell script that force-removes kubeara-agent containers whose Docker state is not running.
 */
export function buildRemoveStoppedCanonicalAgentShellCommand(): string {
  const containerName = AGENT_INSTALL.CONTAINER_NAME;

  return [
    `for cid in $(docker ps -aq --filter ${shellQuote(`name=^/${containerName}$`)} 2>/dev/null); do`,
    `  status=$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null)`,
    `  if [ "$status" != "running" ]; then`,
    `    docker rm -f "$cid" >/dev/null 2>&1 || true`,
    `  fi`,
    `done`,
  ].join(" ");
}

/**
 * Shell commands to force-remove the Kubeara agent container, volumes, and images on the host.
 */
export function buildAgentHostCleanupShellCommand(
  imageRefs: string[],
  options?: { installDir?: string; configuredImage?: string },
): string {
  const containerName = AGENT_INSTALL.CONTAINER_NAME;
  const installDir = options?.installDir?.trim() || AGENT_INSTALL.REMOTE_DIR;
  const project = resolveAgentComposeProjectName(installDir);
  const composeFile = `${installDir}/${AGENT_INSTALL.COMPOSE_FILE}`;
  const envFile = `${installDir}/${AGENT_INSTALL.ENV_FILE}`;

  const images = [
    ...new Set(
      [...imageRefs, options?.configuredImage?.trim()]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  ];
  const quotedImages = images.map(shellQuote).join(" ");

  return [
    `if [ -f ${shellQuote(composeFile)} ] && [ -f ${shellQuote(envFile)} ]; then docker compose -f ${shellQuote(composeFile)} --env-file ${shellQuote(envFile)} -p ${shellQuote(project)} down --volumes --rmi all --remove-orphans >/dev/null 2>&1 || true; fi`,
    `docker update --restart=no ${containerName} >/dev/null 2>&1 || true`,
    `docker rm -f ${containerName} >/dev/null 2>&1 || true`,
    `for cid in $(docker ps -aq --filter ${shellQuote(`name=${containerName}`)} 2>/dev/null); do docker rm -f "$cid" >/dev/null 2>&1 || true; done`,
    `for cid in $(docker ps -aq --filter ${shellQuote(`label=com.docker.compose.project=${project}`)} 2>/dev/null); do docker rm -f "$cid" >/dev/null 2>&1 || true; done`,
    `for vol in $(docker volume ls -q --filter name=agent_deployments 2>/dev/null); do docker volume rm -f "$vol" >/dev/null 2>&1 || true; done`,
    `for net in $(docker network ls -q --filter ${shellQuote(`label=com.docker.compose.project=${project}`)} 2>/dev/null); do docker network rm "$net" >/dev/null 2>&1 || true; done`,
    quotedImages
      ? `for img in ${quotedImages}; do docker rmi -f "$img" >/dev/null 2>&1 || true; done`
      : "true",
    `for img in $(docker images ${shellQuote("kubeara/agent")} -q 2>/dev/null); do docker rmi -f "$img" >/dev/null 2>&1 || true; done`,
  ].join("; ");
}
