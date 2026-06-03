export const SOCKET_EVENTS = {
  DEPLOY: "deploy",
  REMOVE: "deploy:remove",
  DEPLOY_TEMPLATE: "deploy:template",
  DEPLOYMENT_STATUS: "deployment:status",
  CONTAINER_LOG: "container:logs",
  LOGS_SUBSCRIBE: "logs:subscribe",
  /** Control panel → console (unified log stream). */
  DEPLOYMENT_STREAM: "deployment:stream",
  AGENT_CONNECTED: "agent:connected",
  AGENT_DISCONNECTED: "agent:disconnected",
};
