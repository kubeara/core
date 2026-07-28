import {
  parseCustomComposeEnvironmentVariables,
  resolveCustomComposeDeploymentVariables,
} from "./custom-compose-env.util";

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
});
