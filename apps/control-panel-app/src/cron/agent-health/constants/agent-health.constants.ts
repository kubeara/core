export const AGENT_HEALTH = {
  CRON_INTERVAL_MS: 1_000,
  /** Minimum delay between cron-triggered install attempts for the same server. */
  INSTALL_RETRY_INTERVAL_MS: 60_000,
  LOG_PREFIX: "[AgentHealthCron]",
  AGENT_DISCONNECTED_MESSAGE: "Agent is not connected",
} as const;

export const AGENT_HEALTH_ENV_KEYS = {
  CRON_ENABLED: "AGENT_HEALTH_CRON_ENABLED",
  CRON_INTERVAL_MS: "AGENT_HEALTH_CRON_INTERVAL_MS",
} as const;
