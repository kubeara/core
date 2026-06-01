export const AGENT_INSTALL = {
  REMOTE_DIR: process.env.KUBEARA_AGENT_REMOTE_DIR ?? "/opt/kubeara/agent",
  COMPOSE_FILE: "docker-compose.agent.yml",
  ENV_FILE: ".env.agent",
  PREREQ_SCRIPT: "ensure-agent-prerequisites.sh",
  PREREQ_REMOTE_PATH: "/tmp/kubeara-ensure-agent-prerequisites.sh",
  DEFAULT_IMAGE: "kubeara/agent:latest",
  DEFAULT_PORT: 3001,
  PULL_TIMEOUT_MS: 600_000,
  PREREQ_TIMEOUT_MS: 900_000,
  /** How long compose deploy waits for agent WebSocket after install. */
  CONNECT_WAIT_MS: 120_000,
  CONNECT_POLL_MS: 2_000,
} as const;

export const AGENT_INSTALL_ENV_KEYS = {
  CONTROL_PANEL_URL: "CONTROL_PANEL_URL",
  ENCRYPTION_SECRET: "ENCRYPTION_SECRET",
  KUBEARA_AGENT_IMAGE: "KUBEARA_AGENT_IMAGE",
  KUBEARA_AGENT_DEPLOY_DIR: "KUBEARA_AGENT_DEPLOY_DIR",
  KUBEARA_SERVER_ID: "KUBEARA_SERVER_ID",
} as const;
