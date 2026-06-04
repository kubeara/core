import type { DiscoveredContainerPayload } from "@shared/socket-events";

/** Native `docker ps --format '{{json .}}'` shape (one JSON object per line). */
interface DockerPsNativeLine {
  ID?: string;
  Names?: string;
  Image?: string;
  Status?: string;
  Ports?: string;
  RunningFor?: string;
  Labels?: string;
}

export function parseComposeProjectFromLabels(
  labels: string | undefined,
): string | undefined {
  if (!labels?.trim()) {
    return undefined;
  }

  for (const segment of labels.split(",")) {
    const equalsIndex = segment.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = segment.slice(0, equalsIndex).trim();
    const value = segment.slice(equalsIndex + 1).trim();
    if (key === "com.docker.compose.project" && value) {
      return value;
    }
  }

  return undefined;
}

/**
 * Parses stdout from `docker ps -a --format '{{json .}}'` (one JSON object per line).
 */
export function parseDockerPsStdout(
  stdout: string,
): DiscoveredContainerPayload[] {
  const containers: DiscoveredContainerPayload[] = [];

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let parsed: DockerPsNativeLine;
    try {
      parsed = JSON.parse(trimmed) as DockerPsNativeLine;
    } catch {
      continue;
    }

    const containerId = parsed.ID?.trim();
    const containerName = parsed.Names?.trim();
    if (!containerId || !containerName) {
      continue;
    }

    containers.push({
      containerId,
      containerName,
      imageName: parsed.Image?.trim() ?? "",
      status: parsed.Status?.trim() ?? "",
      ports: parsed.Ports?.trim() ?? "",
      runningSince: parsed.RunningFor?.trim() ?? "",
      composeProject: parseComposeProjectFromLabels(parsed.Labels),
    });
  }

  return containers;
}
