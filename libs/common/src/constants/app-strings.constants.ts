/**
 * Formats a deployment port in use message.
 */
export function formatDeploymentPortInUseMessage(port?: number | null): string {
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

export function extractOccupiedPortFromError(text: string): number | null {
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

export const ERROR_MESSAGES = {
  INVALID_COMPOSE_NAME: "Invalid docker compose project name",
  ENV_GENERATION_FAILED: ".env file was not generated",
  PORT_OCCUPIED: (port: number) => `Port ${port} is already occupied`,
  DEPLOYMENT_PORT_IN_USE: (port: number) =>
    formatDeploymentPortInUseMessage(port),
  COMPOSE_VALIDATION_FAILED: "Docker compose validation failed",
  INSUFFICIENT_RAM: "Not enough RAM available to run this service container",
  INSUFFICIENT_CPU: "Not enough CPU available to run this service container",
  DEPLOYMENT_FAILED: "Deployment failed",
  CLEANUP_FAILED: "Deployment cleanup failed",
  REMOVAL_FAILED: "Deployment removal failed",
  MISSING_REQUIRED_FIELDS: (fields: string) =>
    `Missing required fields: ${fields}`,
  MISSING_COMPOSE_VARS: (vars: string) =>
    `Missing required compose variables: ${vars}`,
  INVALID_NUMBER: (field: string, value: any) =>
    `Field '${field}' must be a number, got '${value}'`,
  INVALID_BOOLEAN: (field: string, value: any) =>
    `Field '${field}' must be a boolean, got '${value}'`,
};

export const SUCCESS_MESSAGES = {
  PREPARING: "Preparing deployment",
  VALIDATING: "Validating docker compose",
  DEPLOYING: "Starting docker compose",
  RUNNING: "Services running",
  COMPLETED: "Deployment completed",
  CLEANUP_COMPLETED: "Deployment cleanup completed",
  REMOVING: "Removing deployment and resources",
  REMOVAL_COMPLETED: "Deployment removed successfully",
};

export const SOCKET_ERROR_MESSAGES = {
  MISSING_SOCKET_PAYLOAD: "Missing socket payload",
  INVALID_SOCKET_PAYLOAD: "Invalid socket payload",
};
