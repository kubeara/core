/**
 * Kinds of operations tracked in the server Activity timeline.
 */
export enum ActivityType {
  DEPLOYMENT = "deployment",
  DEPLOYMENT_REMOVE = "deployment_remove",
  DEPLOYMENT_VALIDATION_STOPPED = "deployment_validation_stopped",
  CONTAINER_START = "container_start",
  CONTAINER_STOP = "container_stop",
  CONTAINER_RESTART = "container_restart",
  CONTAINER_DELETE = "container_delete",
  CONTAINER_LOGS = "container_logs",
  TERMINAL_OPENED = "terminal_opened",
  TERMINAL_DISCONNECTED = "terminal_disconnected",
  SERVER_ADDED = "server_added",
  SERVER_DELETED = "server_deleted",
}
