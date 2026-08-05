export const NODE_ENV = {
  DEVELOPMENT: "development",
  PRODUCTION: "production",
};

export function isProductionEnv(nodeEnv: string | undefined): boolean {
  return nodeEnv === NODE_ENV.PRODUCTION;
}

/**
 * Enable Postgres SSL only when DB_SSL=true.
 * Self-hosted compose sets DB_SSL=false so local Postgres works even if
 * NODE_ENV=production. When DB_SSL is unset, keep legacy production behavior.
 */
export function isDbSslEnabled(
  dbSsl: string | undefined | null,
  nodeEnv?: string | null,
): boolean {
  const normalized = dbSsl?.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return isProductionEnv(nodeEnv ?? undefined);
}

export const SALT_ROUNDS = 10;
