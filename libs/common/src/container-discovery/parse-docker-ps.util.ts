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

/**
 * Derives a human-readable "last restarted" label from Docker status text.
 * Running containers: parses "Up 6 hours (healthy)" → "6 hours ago".
 * Restarting containers: parses "Restarting (5 seconds ago)" → "5 seconds ago".
 * Exited / created containers return an empty string (no reliable restart time).
 */
export function deriveLastRestartedFromDockerStatus(status: string): string {
  const trimmed = status.trim();
  if (!trimmed) {
    return "";
  }

  const upMatch = trimmed.match(/^Up\s+(.+)/i);
  if (upMatch?.[1]) {
    const uptime = upMatch[1].replace(/\s*\([^)]*\)\s*$/g, "").trim();
    return formatDockerDurationAsAgo(uptime);
  }

  const restartingMatch = trimmed.match(/^Restarting\s*\((.+)\)/i);
  if (restartingMatch?.[1]) {
    return formatDockerDurationAsAgo(restartingMatch[1].trim());
  }

  if (/^Exited/i.test(trimmed) || /^Created/i.test(trimmed)) {
    return "";
  }

  return "";
}

function formatDockerDurationAsAgo(duration: string): string {
  let text = duration
    .trim()
    .replace(/\s+ago\s*$/i, "")
    .trim();
  if (!text) {
    return "";
  }

  text = text
    .replace(/^about a minute$/i, "1 min")
    .replace(/^about an hour$/i, "1 hour")
    .replace(/^less than a second$/i, "<1 sec")
    .replace(/^(\d+)\s+seconds?$/i, "$1 sec")
    .replace(/^(\d+)\s+minutes?$/i, "$1 min")
    .replace(/^(\d+)\s+hours?$/i, "$1 hour")
    .replace(/^(\d+)\s+days?$/i, "$1 day")
    .replace(/^(\d+)\s+weeks?$/i, "$1 week")
    .replace(/^(\d+)\s+months?$/i, "$1 month")
    .replace(/^(\d+)\s+years?$/i, "$1 year")
    .replace(/^(\d+)s$/i, "$1 sec")
    .replace(/^(\d+)m$/i, "$1 min")
    .replace(/^(\d+)h$/i, "$1 hour")
    .replace(/^(\d+)d$/i, "$1 day")
    .replace(/^<1s$/i, "<1 sec");

  return `${text} ago`;
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

    const status =
      parsed.Status?.trim() ??
      (parsed as { status?: string }).status?.trim() ??
      "";
    const runningSince =
      parsed.RunningFor?.trim() ??
      (parsed as { runningFor?: string }).runningFor?.trim() ??
      "";

    containers.push({
      containerId,
      containerName,
      imageName: parsed.Image?.trim() ?? "",
      status,
      ports: parsed.Ports?.trim() ?? "",
      runningSince,
      lastRestarted: deriveLastRestartedFromDockerStatus(status),
      composeProject: parseComposeProjectFromLabels(parsed.Labels),
    });
  }

  return containers;
}
