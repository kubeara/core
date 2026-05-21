/**
 * Database configuration and utilities
 */

export interface DatabaseConfig {
  type: "postgres" | "mysql" | "sqlite";
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export function getDatabaseConfig(): DatabaseConfig {
  try {
    return {
      type: "postgres",
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USERNAME || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      database: process.env.DB_DATABASE || "templates",
    };
  } catch (error) {
    throw new Error(
      `Failed to build database config: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
