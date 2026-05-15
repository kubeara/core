export const APP_CONFIG = {
  DEPLOYMENTS_DIR: 'deployments',
  DEFAULT_LOG_STREAM_DURATION: 30000,
  REGEX: {
    COMPOSE_PLACEHOLDER: /\$\{([A-Za-z0-9_]+)(?::-.*?)?\}|\$([A-Za-z0-9_]+)/g,
    SANITIZATION: /[^a-z0-9_-]/gi,
  },
  SENSITIVE_KEYS: ['PASSWORD', 'SECRET', 'API_KEY', 'TOKEN', 'KEY', 'AUTH'],
};
