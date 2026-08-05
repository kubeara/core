export const NODE_ENV = {
  DEVELOPMENT: "development",
  PRODUCTION: "production",
};

export function isProductionEnv(nodeEnv: string | undefined): boolean {
  return nodeEnv === NODE_ENV.PRODUCTION;
}

/**
 * Enable Postgres SSL only when DB_SSL=true.
 * Local/self-host examples set DB_SSL=false; production sets DB_SSL=true.
 */
export function isDbSslEnabled(dbSsl: string | undefined | null): boolean {
  return dbSsl?.trim().toLowerCase() === "true";
}

export const SALT_ROUNDS = 10;
