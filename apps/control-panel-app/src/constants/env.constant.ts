export const NODE_ENV = {
  DEVELOPMENT: "development",
  PRODUCTION: "production",
};

export function isProductionEnv(nodeEnv: string | undefined): boolean {
  return nodeEnv === NODE_ENV.PRODUCTION;
}

export const SALT_ROUNDS = 10;
