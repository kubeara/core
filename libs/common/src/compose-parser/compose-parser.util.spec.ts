import { describe, it, expect } from "@jest/globals";

import {
  buildDeployedComposeYaml,
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

  it("infers required variables from compose occurrence analysis only", () => {
    expect(inferRequiredComposeVariables(sampleCompose)).toEqual([
      "SERVICE_PASSWORD_POSTGRES",
      "SERVICE_PORT_POSTGRES",
      "SERVICE_USER_POSTGRES",
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

  it("parses nested brace defaults in n8n-style URL placeholders", () => {
    const compose = `
services:
  n8n:
    environment:
      - N8N_EDITOR_BASE_URL=\${SERVICE_URL_N8N:-\${SERVICE_URL_N8N_5678}}
`;

    const vars = extractComposeVariables(compose);
    const byName = Object.fromEntries(
      vars.map((variable) => [variable.name, variable]),
    );

    expect(byName.SERVICE_URL_N8N).toMatchObject({
      name: "SERVICE_URL_N8N",
      hasDefaultSyntax: true,
      defaultValue: "${SERVICE_URL_N8N_5678}",
    });
  });

  it("treats ${VAR:-} as optional with empty default", () => {
    const compose = `
services:
  app:
    environment:
      EMPTY: \${EMPTY:-}
`;

    expect(inferRequiredComposeVariables(compose)).toEqual([]);
  });

  it("does not apply empty :- defaults during resolve", () => {
    const compose = `
services:
  app:
    environment:
      EMPTY: \${EMPTY:-}
      FILLED: \${FILLED:-preset}
`;

    const resolved = resolveComposeEnvironment({ compose });

    expect(resolved.env.EMPTY).toBeUndefined();
    expect(resolved.env.FILLED).toBe("preset");
  });

  it("requires variable when mixed required and default syntax occurrences exist", () => {
    const compose = `
services:
  app:
    environment:
      MIXED: \${MIXED}
      OTHER: \${MIXED:-x}
`;

    expect(inferRequiredComposeVariables(compose)).toEqual(["MIXED"]);
  });

  it("uses compose default for SERVICE_PORT when present", () => {
    const composeWithDefault = sampleCompose.replace(
      "${SERVICE_PORT_POSTGRES}:5432",
      "${SERVICE_PORT_POSTGRES:-5432}:5432",
    );

    expect(inferRequiredComposeVariables(composeWithDefault)).toEqual([
      "SERVICE_PASSWORD_POSTGRES",
      "SERVICE_USER_POSTGRES",
    ]);

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

  it("buildDeployedComposeYaml substitutes resolved env and port values", () => {
    const compose = `
services:
  web:
    image: nginx:alpine
    ports:
      - '\${SERVICE_PORT_WEB:-8080}:80'
    environment:
      APP_ENV: \${APP_ENV:-production}
`;

    const deployed = buildDeployedComposeYaml(
      compose,
      { APP_ENV: "staging" },
      { SERVICE_PORT_WEB: 9090 },
    );

    expect(deployed).toContain("9090:80");
    expect(deployed).toContain("APP_ENV: staging");
    expect(deployed).not.toContain("${");
  });
});

describe("CORS_ALLOWED_ORIGINS from server host", () => {
  const kubearaStyleCompose = `
services:
  kubeara:
    ports:
      - '\${SERVICE_PORT_KUBEARA:-9461}:3000'
    environment:
      - SERVICE_URL_KUBEARA_3000
      - SERVICE_PORT_KUBEARA_CONSOLE
      - CORS_ALLOWED_ORIGINS=\${CORS_ALLOWED_ORIGINS:-http://localhost}
  console:
    ports:
      - '\${SERVICE_PORT_KUBEARA_CONSOLE:-7935}:80'
    environment:
      - SERVICE_URL_KUBEARA_CONSOLE_80
`;

  it("rewrites localhost sentinel to http://<publicIp>:<consolePort>", () => {
    const resolved = resolveAndValidateComposeEnvironment({
      compose: kubearaStyleCompose,
      userPorts: {
        SERVICE_PORT_KUBEARA: 9461,
        SERVICE_PORT_KUBEARA_CONSOLE: 7935,
      },
      serverUrlContext: {
        publicIp: "46.224.229.44",
        deploymentId: "deployment-cors-test",
      },
    });

    expect(resolved.env.CORS_ALLOWED_ORIGINS).toBe("http://46.224.229.44:7935");
    expect(resolved.generatedKeys).toContain("CORS_ALLOWED_ORIGINS");
  });

  it("does not overwrite an explicit CORS_ALLOWED_ORIGINS value", () => {
    const resolved = resolveAndValidateComposeEnvironment({
      compose: kubearaStyleCompose,
      userEnv: {
        CORS_ALLOWED_ORIGINS: "https://console.example.com",
      },
      userPorts: {
        SERVICE_PORT_KUBEARA_CONSOLE: 7935,
      },
      serverUrlContext: {
        publicIp: "46.224.229.44",
        deploymentId: "deployment-cors-test",
      },
    });

    expect(resolved.env.CORS_ALLOWED_ORIGINS).toBe(
      "https://console.example.com",
    );
  });

  it("keeps localhost sentinel for loopback server hosts", () => {
    const resolved = resolveAndValidateComposeEnvironment({
      compose: kubearaStyleCompose,
      userPorts: {
        SERVICE_PORT_KUBEARA_CONSOLE: 7935,
      },
      serverUrlContext: {
        publicIp: "127.0.0.1",
        deploymentId: "deployment-cors-local",
      },
    });

    expect(resolved.env.CORS_ALLOWED_ORIGINS).toBe("http://localhost");
  });

  it("does not affect templates without CORS_ALLOWED_ORIGINS (n8n)", () => {
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
`;

    const resolved = resolveAndValidateComposeEnvironment({
      compose: n8nCompose,
      serverUrlContext: {
        publicIp: "46.224.229.44",
        deploymentId: "deployment-n8n-safe",
      },
    });

    expect(resolved.env.CORS_ALLOWED_ORIGINS).toBeUndefined();
    expect(resolved.generatedKeys).not.toContain("CORS_ALLOWED_ORIGINS");
    expect(resolved.env.SERVICE_URL_N8N).toBe(
      "http://n8n-n8n-safe.46.224.229.44.sslip.io",
    );
    expect(resolved.env.SERVICE_URL_N8N_5678).toBe(
      "http://n8n-n8n-safe.46.224.229.44.sslip.io:5678",
    );
    expect(resolved.ports.SERVICE_PORT_N8N).toBe(5678);
  });

  it("does not rewrite CORS when compose has CORS but no SERVICE_PORT_*_CONSOLE", () => {
    const compose = `
services:
  app:
    ports:
      - '\${SERVICE_PORT_APP:-3000}:3000'
    environment:
      - SERVICE_URL_APP_3000
      - CORS_ALLOWED_ORIGINS=\${CORS_ALLOWED_ORIGINS:-http://localhost}
`;

    const resolved = resolveAndValidateComposeEnvironment({
      compose,
      userPorts: { SERVICE_PORT_APP: 3000 },
      serverUrlContext: {
        publicIp: "46.224.229.44",
        deploymentId: "deployment-app-no-console",
      },
    });

    expect(resolved.env.CORS_ALLOWED_ORIGINS).toBe("http://localhost");
    expect(resolved.generatedKeys).not.toContain("CORS_ALLOWED_ORIGINS");
  });
});
