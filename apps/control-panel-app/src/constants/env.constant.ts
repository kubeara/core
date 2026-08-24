export const NODE_ENV = {
  DEVELOPMENT: "development",
  PRODUCTION: "production",
};

export function isProductionEnv(nodeEnv: string | undefined): boolean {
  return nodeEnv === NODE_ENV.PRODUCTION;
}

/**
 * Enable Postgres SSL only when DB_SSL=true.
 * Self-host compose sets DB_SSL=false even with NODE_ENV=production.
 */
export function isDbSslEnabled(dbSsl: string | undefined | null): boolean {
  return dbSsl?.trim().toLowerCase() === "true";
}

export const SALT_ROUNDS = 10;
