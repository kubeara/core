import type { ContainerActionType } from "@shared/socket-events";

export const CONTAINER_ACTION_TIMEOUT_MS = 60_000;
export const DOCKER_PS_TIMEOUT_MS = 10_000;
export const DOCKER_PS_COMMAND = ["ps", "-a", "--format", "{{json .}}"];
export const CONTAINER_LOGS_TAIL_LINES = 200;

export const CONTAINER_LOGS_COMMAND = (containerId: string): string[] => [
  "logs",
  "-f",
  "--tail",
  String(CONTAINER_LOGS_TAIL_LINES),
  containerId,
];

export const BUILTIN_DOCKER_NETWORKS = new Set(["bridge", "host", "none"]);

export const DOCKER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

const DOCKER_ACTION_ARGS: Record<
  Exclude<ContainerActionType, "delete">,
  string[]
> = {
  stop: ["stop"],
  restart: ["restart"],
};

export function buildDockerActionArgs(
  action: Exclude<ContainerActionType, "delete">,
  containerId: string,
): string[] {
  return [...DOCKER_ACTION_ARGS[action], containerId];
}
