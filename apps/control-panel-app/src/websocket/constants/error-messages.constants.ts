export const WEBSOCKET_ERROR_MESSAGES = {
  NO_CONNECTED_AGENT: (serverId: string) =>
    `No connected agent for server '${serverId}'`,

  NO_CONNECTED_AGENT_FOR_DEPLOYMENT: (serverId: string, deploymentId: string) =>
    `No connected agent for server '${serverId}' (deployment ${deploymentId})`,

  NO_CONNECTED_AGENT_FOR_TEMPLATE: (serverId: string, templateName: string) =>
    `No connected agent for server '${serverId}' (template ${templateName})`,

  AGENT_NOT_CONNECTED: (serverId: string, templateName: string) =>
    `Agent for server '${serverId}' is disconnected (template ${templateName})`,

  AGENT_DOES_NOT_SUPPORT_REMOVAL: (serverId: string) =>
    `Connected agent for server '${serverId}' does not support agent removal`,

  MISSING_REQUEST_ID_FOR_DEPLOYMENT_VALIDATION:
    "Missing requestId for deployment validation",

  AGENT_RETURNED_NO_SERVER_RESOURCES:
    "Agent returned no server resource metrics",

  AGENT_RETURNED_NO_TERMINAL_SESSION_ID:
    "Agent returned no terminal session id",

  AGENT_RETURNED_NO_CONTAINER_LOGS_SESSION_ID:
    "Agent returned no container logs session id",

  AGENT_REMOVAL_FAILED: "Agent removal failed",

  DEPLOYMENT_REMOVAL_FAILED: "Deployment removal failed",

  AGENT_DISCONNECTED: {
    GENERIC: "Agent disconnected",
    CONTAINER_DISCOVERY: "Agent disconnected during container discovery",
    SERVER_RESOURCES: "Agent disconnected during server resource collection",
    DEPLOYMENT_VALIDATION: "Agent disconnected during deployment validation",
    CONTAINER_ACTION: "Agent disconnected during container action",
    DEPLOYMENT_REMOVAL: "Agent disconnected during deployment removal",
    AGENT_REMOVAL: "Agent disconnected during agent removal",
    TERMINAL_CONNECT: "Agent disconnected during terminal connect",
    CONTAINER_LOGS_START: "Agent disconnected during container logs start",
  },

  TIMEOUT: {
    DEPLOYMENT_REMOVE: (timeoutSec: number, serverId: string) =>
      `Deployment remove timed out after ${timeoutSec}s for server '${serverId}'`,

    AGENT_REMOVE: (timeoutSec: number, serverId: string) =>
      `Agent removal timed out after ${timeoutSec}s for server '${serverId}'`,

    SERVER_RESOURCES: (timeoutSec: number, serverId: string) =>
      `Server resource collection timed out after ${timeoutSec}s for server '${serverId}'`,

    DEPLOYMENT_VALIDATE: (timeoutSec: number, serverId: string) =>
      `Deployment validation timed out after ${timeoutSec}s for server '${serverId}'`,

    CONTAINER_ACTION: (timeoutSec: number, serverId: string) =>
      `Container action timed out after ${timeoutSec}s for server '${serverId}'`,

    TERMINAL_CONNECT: (timeoutSec: number, serverId: string) =>
      `Terminal connect timed out after ${timeoutSec}s for server '${serverId}'`,

    CONTAINER_LOGS_START: (timeoutSec: number, serverId: string) =>
      `Container logs start timed out after ${timeoutSec}s for server '${serverId}'`,

    CONTAINER_DISCOVER: (timeoutSec: number, serverId: string) =>
      `Container discovery timed out after ${timeoutSec}s for server '${serverId}'`,
  },
} as const;
