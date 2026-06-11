import { BadRequestException } from "@nestjs/common";
import type { ContainerActionType } from "@shared/socket-events";

const DOCKER_CONTAINER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

/**
 * The Docker action commands.
 */
const DOCKER_ACTION_COMMAND: Record<
  Exclude<ContainerActionType, "delete">,
  string
> = {
  stop: "docker stop",
  restart: "docker restart",
};

export function assertValidContainerId(containerId: string): string {
  const trimmed = containerId.trim();
  if (!trimmed || !DOCKER_CONTAINER_ID_PATTERN.test(trimmed)) {
    throw new BadRequestException("Invalid container ID");
  }
  return trimmed;
}

/**
 * Builds the host container delete command using a Bash script.
 */
function buildHostContainerDeleteCommand(containerId: string): string {
  const script = [
    `ID=${JSON.stringify(containerId)}`,
    `IMAGE=$(docker inspect -f '{{.Image}}' "$ID")`,
    `NETWORKS=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$ID")`,
    `docker rm -f "$ID"`,
    `[ -n "$IMAGE" ] && docker rmi "$IMAGE" 2>/dev/null || true`,
    `for net in $NETWORKS; do`,
    `  case "$net" in bridge|host|none|"") continue ;; esac`,
    `  docker network rm "$net" 2>/dev/null || true`,
    `done`,
    `printf 'Container, image, and networks cleaned up\\n'`,
  ].join("\n");

  return `bash -lc ${JSON.stringify(script)}`;
}

/**
 * Builds the host container action command.
 */
export function buildHostContainerActionCommand(
  action: ContainerActionType,
  containerId: string,
): string {
  const safeId = assertValidContainerId(containerId);
  if (action === "delete") {
    return buildHostContainerDeleteCommand(safeId);
  }
  return `${DOCKER_ACTION_COMMAND[action]} ${safeId}`;
}
