export type DockerVolumeMount = {
  Type?: string;
  Name?: string;
  Source?: string;
};

/** Named volumes and anonymous volume hashes (e.g. 64-char hex). */
export const DOCKER_VOLUME_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

const DOCKER_VOLUME_SOURCE_PATTERN = /\/volumes\/([^/]+)\/_data\/?$/;

/**
 * Returns true when the value is a safe Docker volume name for shell commands.
 */
export function isSafeDockerVolumeName(name: string): boolean {
  return DOCKER_VOLUME_NAME_PATTERN.test(name);
}

/**
 * Reads a volume name from a mount entry or from a `/var/lib/docker/volumes/.../_data` path.
 */
function resolveDockerVolumeName(
  name?: string,
  source?: string,
): string | null {
  const explicitName = name?.trim();
  if (explicitName && isSafeDockerVolumeName(explicitName)) {
    return explicitName;
  }

  const sourcePath = source?.trim();
  if (!sourcePath) {
    return null;
  }

  const match = sourcePath.match(DOCKER_VOLUME_SOURCE_PATTERN);
  const fromSource = match?.[1]?.trim();
  if (fromSource && isSafeDockerVolumeName(fromSource)) {
    return fromSource;
  }

  return null;
}

/**
 * Collects unique volume names from Docker mount objects.
 */
export function parseDockerVolumeNamesFromMounts(
  mounts: DockerVolumeMount[],
): string[] {
  const names = new Set<string>();

  for (const mount of mounts) {
    if ((mount.Type ?? "").toLowerCase() !== "volume") {
      continue;
    }

    const resolvedName = resolveDockerVolumeName(mount.Name, mount.Source);
    if (resolvedName) {
      names.add(resolvedName);
    }
  }

  return [...names];
}

/**
 * Parses `docker inspect -f '{{json .Mounts}}'` output into volume names.
 * Returns an empty list when the payload is missing or invalid.
 */
export function parseDockerVolumeNamesFromInspectJson(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parseDockerVolumeNamesFromMounts(parsed as DockerVolumeMount[]);
  } catch {
    return [];
  }
}
