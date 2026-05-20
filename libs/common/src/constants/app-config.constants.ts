export const APP_CONFIG = {
  DEPLOYMENTS_DIR: 'deployments',
  DEFAULT_LOG_STREAM_DURATION: 30000,
  REGEX: {
    // Do not treat Docker's $$VAR escape as a compose-time placeholder ($$ → $ in container)
    COMPOSE_PLACEHOLDER:
        /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}|(?<!\$)\$([A-Za-z_][A-Za-z0-9_]*)/g,
    SANITIZATION: /[^a-z0-9_-]/gi,
  },
  SENSITIVE_KEYS: ['PASSWORD', 'SECRET', 'API_KEY', 'TOKEN', 'KEY', 'AUTH'],
};
