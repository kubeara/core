import { describe, expect, it } from "@jest/globals";
import type { CustomComposeServiceEnvironment } from "../api/custom-compose";
import {
  enrichServiceEnvironmentsFromEditor,
  isServerMaskedEnvValue,
  parseDotEnvContent,
} from "./custom-compose-env-preview.util";

describe("custom-compose-env-preview.util", () => {
  it("detects server-masked placeholder values", () => {
    expect(isServerMaskedEnvValue("******")).toBe(true);
    expect(isServerMaskedEnvValue("secret")).toBe(false);
  });

  it("parses dotenv content", () => {
    expect(parseDotEnvContent("POSTGRES_PASSWORD=super-secret\n")).toEqual({
      POSTGRES_PASSWORD: "super-secret",
    });
  });

  it("restores password values from editor content when API returns asterisks", () => {
    const serviceEnvironments: CustomComposeServiceEnvironment[] = [
      {
        serviceName: "db",
        env: {
          POSTGRES_PASSWORD: "******",
          DATABASE_PASSWORD: "******",
          POSTGRES_USER: "postgres",
        },
      },
    ];

    const enriched = enrichServiceEnvironmentsFromEditor(
      serviceEnvironments,
      `
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      DATABASE_PASSWORD: \${DATABASE_PASSWORD}
      POSTGRES_USER: postgres
`,
      "POSTGRES_PASSWORD=super-secret\nDATABASE_PASSWORD=db-secret\n",
    );

    expect(enriched[0]?.env).toEqual({
      POSTGRES_PASSWORD: "super-secret",
      DATABASE_PASSWORD: "db-secret",
      POSTGRES_USER: "postgres",
    });
  });

  it("applies shared env vars to every service that declares them", () => {
    const serviceEnvironments: CustomComposeServiceEnvironment[] = [
      {
        serviceName: "api",
        env: {
          DATABASE_PASSWORD: "******",
          API_KEY: "api-key",
        },
      },
      {
        serviceName: "worker",
        env: {
          WORKER_QUEUE: "redis",
        },
      },
    ];

    const enriched = enrichServiceEnvironmentsFromEditor(
      serviceEnvironments,
      `
services:
  api:
    image: nginx:alpine
    environment:
      DATABASE_PASSWORD: \${DATABASE_PASSWORD}
      API_KEY: \${API_KEY}
  worker:
    image: nginx:alpine
    environment:
      DATABASE_PASSWORD: \${DATABASE_PASSWORD}
      WORKER_QUEUE: redis
`,
      "DATABASE_PASSWORD=shared-secret\n",
    );

    expect(enriched).toEqual([
      {
        serviceName: "api",
        env: {
          API_KEY: "api-key",
          DATABASE_PASSWORD: "shared-secret",
        },
      },
      {
        serviceName: "worker",
        env: {
          DATABASE_PASSWORD: "shared-secret",
          WORKER_QUEUE: "redis",
        },
      },
    ]);
  });

  it("preserves resolved API values when compose uses quoted placeholders", () => {
    const serviceEnvironments: CustomComposeServiceEnvironment[] = [
      {
        serviceName: "app",
        env: {
          APP_ENV: "production",
          APP_NAME: "Custom Node App",
          DATABASE_HOST: "postgres",
          DATABASE_NAME: "custom_app",
          DATABASE_USER: "appuser",
          DATABASE_PASSWORD: "apppassword",
        },
      },
      {
        serviceName: "postgres",
        env: {
          POSTGRES_DB: "custom_app",
          POSTGRES_USER: "appuser",
          POSTGRES_PASSWORD: "apppassword",
        },
      },
    ];

    const enriched = enrichServiceEnvironmentsFromEditor(
      serviceEnvironments,
      `
services:
  app:
    image: nginx:alpine
    environment:
      APP_ENV: "\${APP_ENV}"
      APP_NAME: "\${APP_NAME}"
      DATABASE_HOST: "\${DATABASE_HOST}"
      DATABASE_NAME: "\${DATABASE_NAME}"
      DATABASE_USER: "\${DATABASE_USER}"
      DATABASE_PASSWORD: "\${DATABASE_PASSWORD}"
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: "\${DATABASE_NAME}"
      POSTGRES_USER: "\${DATABASE_USER}"
      POSTGRES_PASSWORD: "\${DATABASE_PASSWORD}"
`,
      "APP_ENV=production\nDATABASE_PASSWORD=apppassword\n",
    );

    expect(enriched).toEqual(serviceEnvironments);
  });

  it("resolves placeholder values that reference another env variable", () => {
    const enriched = enrichServiceEnvironmentsFromEditor(
      [
        {
          serviceName: "app",
          env: { DATABASE_PASSWORD: "apppassword" },
        },
        {
          serviceName: "postgres",
          env: { POSTGRES_PASSWORD: "${DATABASE_PASSWORD}" },
        },
      ],
      `
services:
  app:
    image: nginx:alpine
    environment:
      DATABASE_PASSWORD: apppassword
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: \${DATABASE_PASSWORD}
`,
      "",
    );

    expect(enriched[1]?.env.POSTGRES_PASSWORD).toBe("apppassword");
  });
});
