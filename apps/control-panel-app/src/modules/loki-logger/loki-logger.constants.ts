export const LOKI_LOGGER_SERVICE_NAME = "control-panel-app";

/** When `KUBEARA_ENV` equals this (case-insensitive), logs ship to Grafana Loki. */
export const LOKI_SHIPPING_ENV = "PROD";

export const LOKI_ENV_KEYS = {
  PUSH_URL: "GRAFANA_CLOUD_LOKI_URL",
  USER: "GRAFANA_CLOUD_LOKI_USER",
  API_KEY: "GRAFANA_CLOUD_LOKI_API_KEY",
  ENV_LABEL: "KUBEARA_ENV",
  HOST_LABEL: "KUBEARA_HOST_LABEL",
  LOG_LEVEL: "LOG_LEVEL",
} as const;
