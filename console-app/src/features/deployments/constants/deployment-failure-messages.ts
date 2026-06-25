function formatDeploymentPortInUseMessage(port?: number | null): string {
  if (
    typeof port === "number" &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535
  ) {
    return `Port ${port} is already in use. Please use another port.`;
  }

  return "Port is already in use. Please use another port.";
}

function extractOccupiedPortFromError(text: string): number | null {
  const bindMatch = text.match(/bind for(?:\s+[\d.]+)?:\s*(\d{1,5})\b/i);
  if (bindMatch) {
    const port = Number(bindMatch[1]);
    if (port > 0 && port <= 65535) {
      return port;
    }
  }

  const portMatch = text.match(/\bport\s+(\d{1,5})\s+is already\b/i);
  if (portMatch) {
    const port = Number(portMatch[1]);
    if (port > 0 && port <= 65535) {
      return port;
    }
  }

  return null;
}

export function isDeploymentPortConflict(text: string): boolean {
  const normalized = text.toLowerCase();

  return (
    normalized.includes("port is already allocated") ||
    normalized.includes("port is already in use") ||
    normalized.includes("is already in use. please use another port") ||
    normalized.includes("address already in use") ||
    (normalized.includes("bind for") && normalized.includes("failed"))
  );
}

export function isDeploymentResourceConflict(text: string): boolean {
  const normalized = text.toLowerCase();

  return (
    normalized.includes("not enough ram available") ||
    normalized.includes("not enough cpu available")
  );
}

export function mapDeploymentFailureMessage(
  error?: string | null,
  statusMessage?: string | null,
  logText?: string,
): string {
  const combined = [error, statusMessage, logText]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");

  if (isDeploymentPortConflict(combined)) {
    return formatDeploymentPortInUseMessage(
      extractOccupiedPortFromError(combined),
    );
  }

  if (isDeploymentResourceConflict(combined)) {
    const detail = error?.trim() || statusMessage?.trim();
    if (detail) {
      return detail;
    }
  }

  const detail = error?.trim() || statusMessage?.trim();
  if (detail && detail !== "Deployment failed") {
    return detail.startsWith("Deployment failed")
      ? detail
      : `Deployment failed: ${detail}`;
  }

  return "Deployment failed. Check the logs for details.";
}
