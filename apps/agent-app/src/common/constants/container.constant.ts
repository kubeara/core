import type { ContainerActionType } from "@shared/socket-events";

export const CONTAINER_ACTION_TIMEOUT_MS = 60_000;
export const DOCKER_PS_TIMEOUT_MS = 10_000;
export const DOCKER_PS_COMMAND = ["ps", "-a", "--format", "{{json .}}"];

export const BUILTIN_DOCKER_NETWORKS = new Set(["bridge", "host", "none"]);

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
