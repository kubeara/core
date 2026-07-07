export const AGENT_HEALTH_MESSAGES = {
  DISCONNECTED: "Agent app is not connected",
  PRESENT_NOT_CONNECTED:
    "Agent container is running on host but not connected to control panel",
  STOPPED: "Agent container exists on host but is stopped",
  REMOVED: "Agent container is not present on host",
} as const;

export const AGENT_HEALTH_ROUTES = {
  CRON_TICK: "/api/servers/agent-health/cron-tick",
} as const;

export const AGENT_HEALTH_HEADERS = {
  CRON_SECRET: "x-cron-secret",
} as const;

export const AGENT_HEALTH_ENV_KEYS = {
  CRON_ENABLED: "AGENT_HEALTH_CRON_ENABLED",
  CRON_INTERVAL_MS: "AGENT_HEALTH_CRON_INTERVAL_MS",
  CRON_INTERNAL_SECRET: "CRON_INTERNAL_SECRET",
  CRON_INTERNAL_BASE_URL: "CRON_INTERNAL_BASE_URL",
  PORT: "PORT",
} as const;

export const AGENT_HEALTH_DEFAULT_CRON_INTERVAL_MS = 1000;

export const AGENT_HEALTH_CRON_JOB_NAME = "agent-health-cron";
