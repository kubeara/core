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

  if (trimmed.toLowerCase().startsWith("up ")) {
    let uptime = trimmed.slice(3).trim();

    const healthcheckStart = uptime.lastIndexOf("(");
    if (healthcheckStart !== -1 && uptime.endsWith(")")) {
      uptime = uptime.slice(0, healthcheckStart).trim();
    }

    return formatDockerDurationAsAgo(uptime);
  }

  if (trimmed.toLowerCase().startsWith("restarting")) {
    const openingParen = trimmed.indexOf("(");
    const closingParen = trimmed.lastIndexOf(")");

    if (
      openingParen !== -1 &&
      closingParen > openingParen &&
      closingParen === trimmed.length - 1
    ) {
      const duration = trimmed.slice(openingParen + 1, closingParen).trim();

      return formatDockerDurationAsAgo(duration);
    }
  }

  if (
    trimmed.toLowerCase().startsWith("exited") ||
    trimmed.toLowerCase().startsWith("created")
  ) {
    return "";
  }

  return "";
}

function formatDockerDurationAsAgo(duration: string): string {
  let text = duration.trim();

  if (!text) {
    return "";
  }

  if (text.toLowerCase().endsWith(" ago")) {
    text = text.slice(0, -4).trim();
  }

  const normalizedDuration = normalizeDockerDuration(text);

  return `${normalizedDuration} ago`;
}

function normalizeDockerDuration(duration: string): string {
  const lowerDuration = duration.toLowerCase();

  if (lowerDuration === "about a minute") {
    return "1 min";
  }

  if (lowerDuration === "about an hour") {
    return "1 hour";
  }

  if (lowerDuration === "less than a second") {
    return "<1 sec";
  }

  const parts = duration.split(/\s+/);

  if (parts.length === 2 && /^\d+$/.test(parts[0])) {
    const value = parts[0];
    const unit = parts[1].toLowerCase();

    switch (unit) {
      case "second":
      case "seconds":
        return `${value} sec`;
      case "minute":
      case "minutes":
        return `${value} min`;
      case "hour":
      case "hours":
        return `${value} hour`;
      case "day":
      case "days":
        return `${value} day`;
      case "week":
      case "weeks":
        return `${value} week`;
      case "month":
      case "months":
        return `${value} month`;
      case "year":
      case "years":
        return `${value} year`;
    }
  }

  if (/^\d+[smhd]$/i.test(duration)) {
    const value = duration.slice(0, -1);
    const unit = duration.slice(-1).toLowerCase();

    switch (unit) {
      case "s":
        return `${value} sec`;
      case "m":
        return `${value} min`;
      case "h":
        return `${value} hour`;
      case "d":
        return `${value} day`;
    }
  }

  if (lowerDuration === "<1s") {
    return "<1 sec";
  }

  return duration;
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
