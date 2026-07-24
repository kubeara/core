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
  start: "docker start",
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
 * Builds the host fallback delete command.
 * Stops and removes the container, then best-effort removes its image,
 * mounted volumes, and attached user-defined networks.
 */
function buildHostContainerDeleteCommand(containerId: string): string {
  const script = [
    `ID=${JSON.stringify(containerId)}`,
    `IMAGE=$(docker inspect -f '{{.Image}}' "$ID")`,
    `mapfile -t VOLUME_LINES < <(docker inspect -f '{{range .Mounts}}{{if eq .Type "volume"}}{{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}}{{"\n"}}{{end}}{{end}}' "$ID")`,
    `mapfile -t NETWORK_LINES < <(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$ID")`,
    `docker stop "$ID" 2>/dev/null || true`,
    `docker rm -fv "$ID"`,
    `[ -n "$IMAGE" ] && docker rmi -f "$IMAGE" 2>/dev/null || true`,
    `for line in "${"$"}{VOLUME_LINES[@]}"; do`,
    `  vol="$line"`,
    `  if [[ "$line" == *"/volumes/"* ]]; then`,
    `    vol=$(sed -n 's|.*/volumes/\\([^/]*\\)/_data.*|\\1|p' <<< "$line")`,
    `  fi`,
    `  [ -n "$vol" ] && docker volume rm -f "$vol" 2>/dev/null || true`,
    `done`,
    `for net in "${"$"}{NETWORK_LINES[@]}"; do`,
    `  [[ -n "$net" && "$net" != "bridge" && "$net" != "host" && "$net" != "none" ]] && docker network rm "$net" 2>/dev/null || true`,
    `done`,
    `printf 'Container stopped, removed, image deleted, and mounted volumes and networks removed\\n'`,
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
