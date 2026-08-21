import {
  buildEncryptedCustomComposePayload,
  parseCustomComposeEnvironmentVariables,
  parseDotEnvFile,
  resolveCustomComposeDeploymentVariables,
  validateCustomComposeWithEnvFile,
} from "./custom-compose-env.util";
import type { CustomComposeEncryptedContent } from "./custom-compose.types";

describe("custom-compose-env.util", () => {
  it("extracts mapping-format environment values from all services", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
    environment:
      APP_NAME: "Custom Service"
      APP_ENV: production
  api:
    image: node:20-alpine
    environment:
      API_TOKEN: "secret"
`;

    const variables = parseCustomComposeEnvironmentVariables(compose);

    expect(variables.map((variable) => variable.name)).toEqual(
      expect.arrayContaining(["APP_NAME", "APP_ENV", "API_TOKEN"]),
    );
    expect(
      variables.find((variable) => variable.name === "APP_NAME")?.defaultValue,
    ).toBe("Custom Service");
    expect(
      variables.find((variable) => variable.name === "APP_ENV")?.defaultValue,
    ).toBe("production");
  });

  it("extracts array-format environment values", () => {
    const compose = `
services:
  app:
    image: alpine:3.19
    environment:
      - APP_NAME=Custom Service
      - APP_ENV=production
`;

    const variables = parseCustomComposeEnvironmentVariables(compose);

    expect(variables.map((variable) => variable.name)).toEqual(
      expect.arrayContaining(["APP_NAME", "APP_ENV"]),
    );
    expect(
      variables.find((variable) => variable.name === "APP_NAME")?.defaultValue,
    ).toBe("Custom Service");
  });

  it("extracts compose placeholders not declared as literal environment values", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
    ports:
      - '\${SERVICE_PORT_WEB:-8080}:80'
    environment:
      APP_ENV: \${APP_ENV:-production}
`;

    const variables = parseCustomComposeEnvironmentVariables(compose);

    expect(variables.map((variable) => variable.name)).toEqual(
      expect.arrayContaining(["SERVICE_PORT_WEB", "APP_ENV"]),
    );
    expect(
      variables.find((variable) => variable.name === "APP_ENV")?.defaultValue,
    ).toBe("production");
  });

  it("prefers explicit environment values over later placeholder discovery", () => {
    const compose = `
services:
  app:
    image: alpine:3.19
    environment:
      APP_ENV: staging
`;

    const variables = parseCustomComposeEnvironmentVariables(compose);

    expect(
      variables.find((variable) => variable.name === "APP_ENV")?.defaultValue,
    ).toBe("staging");
  });
});

describe("resolveCustomComposeDeploymentVariables", () => {
  it("builds env and port maps from extracted custom compose variables", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    environment:
      APP_NAME: "Custom Service"
      APP_ENV: production
  worker:
    image: alpine:3.19
    environment:
      - WORKER_TOKEN=abc123
`;

    const resolved = resolveCustomComposeDeploymentVariables(compose);

    expect(resolved.env).toMatchObject({
      APP_NAME: "Custom Service",
      APP_ENV: "production",
      WORKER_TOKEN: "abc123",
    });
    expect(resolved.ports).toEqual({});
    expect(resolved.requiredKeys.size).toBe(0);
  });

  it("merges uploaded .env values into the resolved deployment env map", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
    environment:
      APP_ENV: \${APP_ENV}
`;

    const resolved = resolveCustomComposeDeploymentVariables(
      compose,
      {},
      {},
      { APP_ENV: "production", DB_PASSWORD: "secret" },
    );

    expect(resolved.env.APP_ENV).toBe("production");
    expect(resolved.env.DB_PASSWORD).toBe("secret");
  });
});

describe("parseDotEnvFile", () => {
  it("parses KEY=VALUE lines and ignores comments", () => {
    const result = parseDotEnvFile(`
# comment
APP_ENV=production
DB_PASSWORD="secret"
`);

    expect(result.issues).toEqual([]);
    expect(result.variables).toEqual({
      APP_ENV: "production",
      DB_PASSWORD: "secret",
    });
  });

  it("reports invalid .env lines", () => {
    const result = parseDotEnvFile("INVALID LINE");

    expect(result.issues).toEqual([
      expect.objectContaining({ path: ".env:1" }),
    ]);
  });
});

describe("validateCustomComposeWithEnvFile", () => {
  it("resolves compose placeholders from uploaded .env values", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
    environment:
      APP_ENV: \${APP_ENV}
`;

    const result = validateCustomComposeWithEnvFile(
      compose,
      "APP_ENV=production\n",
    );

    expect(result.issues).toEqual([]);
    expect(result.serviceEnvironments).toEqual([
      {
        serviceName: "web",
        env: { APP_ENV: "production" },
      },
    ]);
  });

  it("reports missing referenced variables", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
    environment:
      APP_ENV: \${APP_ENV}
`;

    const result = validateCustomComposeWithEnvFile(compose, "");

    expect(result.issues).toEqual([
      expect.objectContaining({
        path: "variables",
      }),
    ]);
    expect(result.issues[0]?.message).toContain("APP_ENV");
  });

  it("returns per-service env previews when incomplete env is allowed", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
    environment:
      APP_ENV: \${APP_ENV}
      LOG_LEVEL: info
`;

    const result = validateCustomComposeWithEnvFile(compose, "", {
      allowIncompleteEnv: true,
    });

    expect(result.issues).toEqual([]);
    expect(result.serviceEnvironments).toEqual([
      {
        serviceName: "web",
        env: {
          APP_ENV: "${APP_ENV}",
          LOG_LEVEL: "info",
        },
      },
    ]);
  });

  it("includes interpolation variables from ports, volumes, and image", () => {
    const compose = `
services:
  api:
    image: \${IMAGE_NAME}:\${IMAGE_TAG}
    ports:
      - "\${APP_PORT:-3000}:3000"
    volumes:
      - "\${DATA_PATH}:/data"
    environment:
      LOG_LEVEL: info
  worker:
    image: alpine:3.19
`;

    const result = validateCustomComposeWithEnvFile(compose, "", {
      allowIncompleteEnv: true,
    });

    expect(result.issues).toEqual([]);
    expect(
      result.serviceEnvironments.map((service) => service.serviceName),
    ).toEqual(["api", "worker"]);
    expect(result.serviceEnvironments[0]?.env).toEqual(
      expect.objectContaining({
        APP_PORT: "3000",
        IMAGE_NAME: "",
        IMAGE_TAG: "",
        DATA_PATH: "",
        LOG_LEVEL: "info",
      }),
    );
  });

  it("resolves env placeholders that reference a different variable name", () => {
    const compose = `
services:
  app:
    image: nginx:alpine
    environment:
      DATABASE_PASSWORD: apppassword
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: \${DATABASE_PASSWORD}
`;

    const result = validateCustomComposeWithEnvFile(compose, "");

    expect(result.issues).toEqual([]);
    expect(result.serviceEnvironments).toEqual([
      {
        serviceName: "app",
        env: { DATABASE_PASSWORD: "apppassword" },
      },
      {
        serviceName: "postgres",
        env: {
          DATABASE_PASSWORD: "apppassword",
          POSTGRES_PASSWORD: "apppassword",
        },
      },
    ]);
  });

  it("resolves shared env vars independently for each service preview", () => {
    const compose = `
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
`;

    const result = validateCustomComposeWithEnvFile(
      compose,
      "DATABASE_PASSWORD=shared-secret\nAPI_KEY=api-key\n",
    );

    expect(result.issues).toEqual([]);
    expect(result.serviceEnvironments).toEqual([
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

  it("returns resolved sensitive values for client-side masking", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
    environment:
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      DATABASE_PASSWORD: \${DATABASE_PASSWORD}
`;

    const result = validateCustomComposeWithEnvFile(
      compose,
      "POSTGRES_PASSWORD=super-secret\nDATABASE_PASSWORD=db-secret\n",
    );

    expect(result.serviceEnvironments[0]?.env.POSTGRES_PASSWORD).toBe(
      "super-secret",
    );
    expect(result.serviceEnvironments[0]?.env.DATABASE_PASSWORD).toBe(
      "db-secret",
    );
  });
});

describe("buildEncryptedCustomComposePayload", () => {
  it("stores compose yaml and optional env file in one encrypted payload", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
    environment:
      APP_ENV: \${APP_ENV}
`;

    const payload = JSON.parse(
      buildEncryptedCustomComposePayload(
        compose,
        { APP_ENV: "production" },
        {},
        "APP_ENV=production\n",
      ),
    ) as CustomComposeEncryptedContent;

    expect(payload.composeYaml).toContain("APP_ENV: production");
    expect(payload.envFileContent).toContain("APP_ENV=production");
  });

  it("stores compose-only deployments without envFileContent", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
`;

    const payload = JSON.parse(
      buildEncryptedCustomComposePayload(compose, {}, {}, ""),
    ) as CustomComposeEncryptedContent;

    expect(payload.composeYaml).toContain("image: nginx:alpine");
    expect(payload.envFileContent).toBeUndefined();
  });
});
