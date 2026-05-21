import { describe, it, expect } from "@jest/globals";

import {
  extractComposeVariables,
  findMissingComposeVariables,
  findUnknownPortKeys,
  generateMagicEnvValue,
  inferRequiredComposeVariables,
  listComposePortVariables,
  parseMagicEnvCommand,
  resolveAndValidateComposeEnvironment,
  resolveComposeEnvironment,
} from "./compose-parser.util";

describe("compose-parser.util", () => {
  const sampleCompose = `
services:
  postgres:
    image: postgres:16
    ports:
      - '\${SERVICE_PORT_POSTGRES}:5432'
    environment:
      POSTGRES_USER: \${SERVICE_USER_POSTGRES}
      POSTGRES_PASSWORD: \${SERVICE_PASSWORD_POSTGRES}
      POSTGRES_DB: \${POSTGRES_DB:-postgres}
`;

  it("extracts placeholders and defaults", () => {
    const vars = extractComposeVariables(sampleCompose);
    const names = vars.map((v) => v.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "SERVICE_PORT_POSTGRES",
        "SERVICE_USER_POSTGRES",
        "SERVICE_PASSWORD_POSTGRES",
        "POSTGRES_DB",
      ]),
    );

    const db = vars.find((v) => v.name === "POSTGRES_DB");
    expect(db?.defaultValue).toBe("postgres");
  });

  it("parses magic env commands", () => {
    expect(parseMagicEnvCommand("SERVICE_PASSWORD_POSTGRES")).toBe("PASSWORD");
    expect(parseMagicEnvCommand("SERVICE_USER_POSTGRES")).toBe("USER");
    expect(parseMagicEnvCommand("SERVICE_PORT_POSTGRES")).toBe("PORT");
  });

  it("generates magic values", () => {
    expect(generateMagicEnvValue("PASSWORD").length).toBeGreaterThan(10);
    expect(generateMagicEnvValue("USER").length).toBe(16);
  });

  it("auto-fills SERVICE_* secrets and defaults", () => {
    const resolved = resolveComposeEnvironment({
      compose: sampleCompose,
      userPorts: { SERVICE_PORT_POSTGRES: 15432 },
      portSchemaKeys: ["SERVICE_PORT_POSTGRES"],
    });

    expect(resolved.ports.SERVICE_PORT_POSTGRES).toBe(15432);
    expect(resolved.env.POSTGRES_DB).toBe("postgres");
    expect(resolved.env.SERVICE_USER_POSTGRES).toBeTruthy();
    expect(resolved.env.SERVICE_PASSWORD_POSTGRES).toBeTruthy();
    expect(resolved.generatedKeys).toEqual(
      expect.arrayContaining([
        "SERVICE_USER_POSTGRES",
        "SERVICE_PASSWORD_POSTGRES",
      ]),
    );
  });

  it("ignores Docker $$ escaped variables in healthchecks", () => {
    const compose = `
services:
  postgres:
    environment:
      POSTGRES_USER: \${SERVICE_USER_POSTGRESV2}
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB']
`;
    const names = extractComposeVariables(compose).map((v) => v.name);

    expect(names).toContain("SERVICE_USER_POSTGRESV2");
    expect(names).not.toContain("POSTGRES_USER");
    expect(names).not.toContain("POSTGRES_DB");
  });

  it("prefers user-provided values over generated ones", () => {
    const resolved = resolveComposeEnvironment({
      compose: sampleCompose,
      userEnv: {
        SERVICE_USER_POSTGRES: "admin",
        SERVICE_PASSWORD_POSTGRES: "secret",
        POSTGRES_DB: "mydb",
      },
      userPorts: { SERVICE_PORT_POSTGRES: 5433 },
      portSchemaKeys: ["SERVICE_PORT_POSTGRES"],
    });

    expect(resolved.env.SERVICE_USER_POSTGRES).toBe("admin");
    expect(resolved.env.SERVICE_PASSWORD_POSTGRES).toBe("secret");
    expect(resolved.env.POSTGRES_DB).toBe("mydb");
    expect(resolved.generatedKeys).toHaveLength(0);
  });

  it("infers required variables from compose (no default, not auto-generated)", () => {
    expect(inferRequiredComposeVariables(sampleCompose)).toEqual([
      "SERVICE_PORT_POSTGRES",
    ]);
  });

  it("finds missing compose variables after resolve", () => {
    const resolved = resolveComposeEnvironment({ compose: sampleCompose });
    const missing = findMissingComposeVariables(sampleCompose, resolved);

    expect(missing).toEqual(["SERVICE_PORT_POSTGRES"]);
  });

  it("resolveAndValidateComposeEnvironment throws when port is missing", () => {
    expect(() =>
      resolveAndValidateComposeEnvironment({ compose: sampleCompose }),
    ).toThrow("Missing required compose variables: SERVICE_PORT_POSTGRES");
  });

  it("resolveAndValidateComposeEnvironment succeeds when port is provided", () => {
    const resolved = resolveAndValidateComposeEnvironment({
      compose: sampleCompose,
      userPorts: { SERVICE_PORT_POSTGRES: 5432 },
    });

    expect(resolved.ports.SERVICE_PORT_POSTGRES).toBe(5432);
    expect(resolved.env.SERVICE_USER_POSTGRES).toBeTruthy();
    expect(resolved.env.SERVICE_PASSWORD_POSTGRES).toBeTruthy();
  });

  it("accepts port variables supplied in userEnv", () => {
    const resolved = resolveAndValidateComposeEnvironment({
      compose: sampleCompose,
      userEnv: { SERVICE_PORT_POSTGRES: 5433 },
    });

    expect(resolved.ports.SERVICE_PORT_POSTGRES).toBe(5433);
  });

  it("uses compose default for SERVICE_PORT when present", () => {
    const composeWithDefault = sampleCompose.replace(
      "${SERVICE_PORT_POSTGRES}:5432",
      "${SERVICE_PORT_POSTGRES:-5432}:5432",
    );

    expect(inferRequiredComposeVariables(composeWithDefault)).toEqual([]);

    const resolved = resolveAndValidateComposeEnvironment({
      compose: composeWithDefault,
    });

    expect(resolved.ports.SERVICE_PORT_POSTGRES).toBe(5432);
  });

  it("findUnknownPortKeys detects port keys not in compose", () => {
    const unknown = findUnknownPortKeys(sampleCompose, {
      SERVICE_PORT_POSTGRESV2: 5435,
    });

    expect(unknown).toEqual(["SERVICE_PORT_POSTGRESV2"]);
    expect(listComposePortVariables(sampleCompose)).toEqual([
      "SERVICE_PORT_POSTGRES",
    ]);
  });
});

describe("n8n URL generation", () => {
  const n8nCompose = `
services:
  n8n:
    ports:
      - '\${SERVICE_PORT_N8N:-5678}:5678'
    environment:
      - SERVICE_URL_N8N_5678
      - N8N_EDITOR_BASE_URL=\${SERVICE_URL_N8N}
      - WEBHOOK_URL=\${SERVICE_URL_N8N}
      - N8N_HOST=\${SERVICE_FQDN_N8N}
      - N8N_RUNNERS_AUTH_TOKEN=\${SERVICE_PASSWORD_N8N}
      - N8N_RUNNERS_BROKER_PORT=\${N8N_RUNNERS_BROKER_PORT:-5679}
`;

  it("generates sslip URLs and passwords for n8n template", () => {
    const resolved = resolveAndValidateComposeEnvironment({
      compose: n8nCompose,
      serverUrlContext: {
        publicIp: "192.168.1.50",
        deploymentId: "deployment-test-n8n",
      },
    });

    expect(resolved.env.SERVICE_URL_N8N).toBe(
      "http://n8n-test-n8n.192.168.1.50.sslip.io",
    );
    expect(resolved.env.SERVICE_FQDN_N8N).toBe(
      "n8n-test-n8n.192.168.1.50.sslip.io",
    );
    expect(resolved.env.SERVICE_URL_N8N_5678).toBe(
      "http://n8n-test-n8n.192.168.1.50.sslip.io:5678",
    );
    expect(resolved.ports.SERVICE_PORT_N8N).toBe(5678);
    expect(resolved.env.SERVICE_PASSWORD_N8N).toBeTruthy();
    expect(resolved.ports.N8N_RUNNERS_BROKER_PORT).toBeUndefined();
    expect(resolved.env.N8N_RUNNERS_BROKER_PORT).toBe("5679");
  });

  it("with useTraefik skips host port publish and port-suffixed URLs", () => {
    const resolved = resolveAndValidateComposeEnvironment({
      compose: n8nCompose,
      serverUrlContext: {
        publicIp: "192.168.1.50",
        deploymentId: "deployment-test-n8n",
        useTraefik: true,
      },
    });

    expect(resolved.env.SERVICE_URL_N8N).toBe(
      "http://n8n-test-n8n.192.168.1.50.sslip.io",
    );
    expect(resolved.env.SERVICE_URL_N8N_5678).toBeUndefined();
    expect(resolved.ports.SERVICE_PORT_N8N).toBeUndefined();
  });
});
