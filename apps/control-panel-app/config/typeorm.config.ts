import * as path from "path";
import * as dotenv from "dotenv";
import { DataSource } from "typeorm";
import { isDbSslEnabled } from "../src/constants/env.constant";

dotenv.config({
  path: path.join(process.cwd(), "apps", "control-panel-app", ".env"),
});

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable ${key}`);
  return value;
}

export default new DataSource({
  type: "postgres",
  host: getRequiredEnv("DB_HOST"),
  port: Number(getRequiredEnv("DB_PORT")),
  username: getRequiredEnv("DB_USERNAME"),
  password: getRequiredEnv("DB_PASSWORD"),
  database: getRequiredEnv("DB_DATABASE"),
  synchronize: false,
  ...(isDbSslEnabled(process.env.DB_SSL, process.env.NODE_ENV)
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
  entities: [
    path.join(
      __dirname,
      "..",
      "src",
      "modules",
      "**",
      "entities",
      "*.entity{.ts,.js}",
    ),
  ],
  migrations: [path.join(__dirname, "..", "migrations", "*{.ts,.js}")],
});
