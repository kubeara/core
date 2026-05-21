export const ERROR_MESSAGES = {
  INVALID_COMPOSE_NAME: "Invalid docker compose project name",
  ENV_GENERATION_FAILED: ".env file was not generated",
  PORT_OCCUPIED: (port: number) => `Port ${port} is already occupied`,
  COMPOSE_VALIDATION_FAILED: "Docker compose validation failed",
  DEPLOYMENT_FAILED: "Deployment failed",
  CLEANUP_FAILED: "Deployment cleanup failed",
  MISSING_REQUIRED_FIELDS: (fields: string) =>
    `Missing required fields: ${fields}`,
  MISSING_COMPOSE_VARS: (vars: string) =>
    `Missing required compose variables: ${vars}`,
  INVALID_NUMBER: (field: string, value: any) =>
    `Field '${field}' must be a number, got '${value}'`,
  INVALID_BOOLEAN: (field: string, value: any) =>
    `Field '${field}' must be a boolean, got '${value}'`,
};

export const SUCCESS_MESSAGES = {
  PREPARING: "Preparing deployment",
  VALIDATING: "Validating docker compose",
  DEPLOYING: "Starting docker compose",
  RUNNING: "Services running",
  COMPLETED: "Deployment completed",
  CLEANUP_COMPLETED: "Deployment cleanup completed",
};

export const SOCKET_ERROR_MESSAGES = {
  MISSING_SOCKET_PAYLOAD: "Missing socket payload",
  INVALID_SOCKET_PAYLOAD: "Invalid socket payload",
};
