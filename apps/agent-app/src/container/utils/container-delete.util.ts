import { parseDockerVolumeNamesFromInspectJson } from "@shared/common";

import {
  BUILTIN_DOCKER_NETWORKS,
  DOCKER_NAME_PATTERN,
} from "../../common/constants/container.constant";

const DOCKER_IMAGE_INSPECT_FORMAT = "{{.Image}}";
const DOCKER_MOUNTS_INSPECT_FORMAT = "{{json .Mounts}}";
const DOCKER_NETWORKS_INSPECT_FORMAT =
  "{{range $k,$v := .NetworkSettings.Networks}}{{$k}}\n{{end}}";

export type DockerExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ContainerDeletePlan = {
  imageId: string;
  volumeNames: string[];
  networkNames: string[];
};

export type ContainerDeleteCleanupResult = {
  logLines: string[];
  stdout: string;
  stderr: string;
};

export const CONTAINER_DELETE_INSPECT = {
  image: DOCKER_IMAGE_INSPECT_FORMAT,
  mounts: DOCKER_MOUNTS_INSPECT_FORMAT,
  networks: DOCKER_NETWORKS_INSPECT_FORMAT,
} as const;

/**
 * Splits docker CLI stdout into trimmed non-empty lines.
 */
export function parseDockerOutputLines(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Returns true for user-defined Docker network names safe to pass to `docker network rm`.
 */
export function isSafeDockerNetworkName(name: string): boolean {
  return !BUILTIN_DOCKER_NETWORKS.has(name) && DOCKER_NAME_PATTERN.test(name);
}

/**
 * Parses network names from `docker inspect` network template output.
 */
export function parseNetworkNamesFromInspect(raw: string): string[] {
  const names = new Set<string>();

  for (const line of parseDockerOutputLines(raw)) {
    if (isSafeDockerNetworkName(line)) {
      names.add(line);
    }
  }

  return [...names];
}

/**
 * Builds the delete plan from docker inspect output collected before the container is removed.
 */
export function buildContainerDeletePlan(input: {
  imageInspectStdout: string;
  mountsInspectStdout: string;
  networksInspectStdout: string;
}): ContainerDeletePlan {
  return {
    imageId: input.imageInspectStdout.trim(),
    volumeNames: parseDockerVolumeNamesFromInspectJson(
      input.mountsInspectStdout,
    ),
    networkNames: parseNetworkNamesFromInspect(input.networksInspectStdout),
  };
}

/**
 * Returns true when docker stop failed because the container was already stopped.
 */
export function isContainerAlreadyStopped(stopDetail: string): boolean {
  const normalized = stopDetail.toLowerCase();
  return (
    normalized.includes("is not running") ||
    normalized.includes("already stopped")
  );
}

/**
 * Formats a cleanup result line for a resource that may still be in use elsewhere.
 */
export function formatCleanupLine(
  resourceType: "Image" | "Volume" | "Network",
  name: string | null,
  removed: boolean,
  detail: string,
): string {
  if (removed) {
    if (name) {
      return `${resourceType} '${name}' removed`;
    }
    return `${resourceType} removed`;
  }

  const suffix = detail.trim() || "may be in use elsewhere";
  if (name) {
    return `${resourceType} '${name}' kept (${suffix})`;
  }
  return `${resourceType} kept (${suffix})`;
}

/**
 * Reads stderr first, then stdout, for docker command failure details.
 */
export function readDockerCommandDetail(result: DockerExecResult): string {
  return result.stderr.trim() || result.stdout.trim() || "";
}
