export const SERVER_ID_HEADER = "x-kubeara-server-id";
export const CONTAINER_DISCOVER_TIMEOUT_MS = 15_000;
export const SERVER_GET_RESOURCES_TIMEOUT_MS = 15_000;
export const CONTAINER_ACTION_TIMEOUT_MS = 60_000;
export const TERMINAL_CONNECT_TIMEOUT_MS = 15_000;
export const CONTAINER_LOGS_START_TIMEOUT_MS = 15_000;

export const STREAM_DEBUG =
  process.env.KUBEARA_STREAM_DEBUG === "true" ||
  process.env.KUBEARA_STREAM_DEBUG === "1";
