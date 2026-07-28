import {
  deriveCustomComposeTemplateSlug,
  encodeComposeYamlToPayload,
  formatCustomComposeTemplateSlugLabel,
  getCustomComposeDisplayNameValidationError,
  getCustomComposeTemplateSlugValidationError,
  listCustomComposeServiceSlugs,
  normalizeCustomComposeDisplayName,
  normalizeCustomComposeTemplateSlug,
  validateCustomComposeStructure,
  validateUploadedCustomCompose,
} from "./custom-compose.util";

describe("custom-compose.util", () => {
  const validCompose = `
services:
  web:
    image: nginx:alpine
    ports:
      - '\${SERVICE_PORT_WEB:-8080}:80'
    environment:
      APP_ENV: \${APP_ENV:-production}
`;

  const standardCompose = `
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    environment:
      APP_NAME: "My Service"
      APP_ENV: "production"

  api:
    image: node:20-alpine
    depends_on:
      - web

volumes:
  app_data:

networks:
  backend:
`;

  const multiServiceCompose = `
services:
  app:
    image: node:22-alpine
  postgres:
    image: postgres:16-alpine
  redis:
    image: redis:7-alpine
`;

  it("accepts compose with placeholders and extracts variables", () => {
    const result = validateUploadedCustomCompose(validCompose);

    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }

    expect(result.suggestedTemplateSlug).toBe("web");
    expect(result.variables.map((variable) => variable.name)).toEqual(
      expect.arrayContaining(["SERVICE_PORT_WEB", "APP_ENV"]),
    );
  });

  it("returns a suggested slug from compose service names", () => {
    const result = validateUploadedCustomCompose(multiServiceCompose);

    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }

    expect(result.suggestedTemplateSlug).toBe("app-postgres-redis");
    expect(deriveCustomComposeTemplateSlug(["app", "postgres", "redis"])).toBe(
      "app-postgres-redis",
    );
    expect(listCustomComposeServiceSlugs(multiServiceCompose)).toEqual([
      "app",
      "postgres",
      "redis",
    ]);
  });

  it("validates user-provided custom deployment display names", () => {
    expect(normalizeCustomComposeDisplayName(" Production API ")).toBe(
      "Production API",
    );
    expect(getCustomComposeDisplayNameValidationError("")).toBe(
      "Deployment name is required",
    );
    expect(getCustomComposeDisplayNameValidationError("Production API")).toBe(
      null,
    );
  });

  it("normalizes suggested slugs without changing case", () => {
    expect(normalizeCustomComposeTemplateSlug("Production API")).toBe(
      "Production-API",
    );
    expect(getCustomComposeTemplateSlugValidationError("")).toBe(
      "Deployment name is required",
    );
    expect(getCustomComposeTemplateSlugValidationError("Production API")).toBe(
      null,
    );
    expect(formatCustomComposeTemplateSlugLabel("Production-API")).toBe(
      "Production API",
    );
  });

  it("accepts standard compose with hardcoded ports", () => {
    const result = validateUploadedCustomCompose(standardCompose);

    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }

    expect(result.composeYaml).toContain('"8080:80"');
    expect(result.suggestedTemplateSlug).toBe("api-web");
    expect(result.variables.map((variable) => variable.name)).toEqual(
      expect.arrayContaining(["APP_NAME", "APP_ENV"]),
    );
  });

  it("accepts mapping-format environment values", () => {
    const compose = `
services:
  app:
    image: alpine:3.19
    environment:
      APP_NAME: "Custom Service"
      APP_ENV: production
`;

    const result = validateUploadedCustomCompose(compose);

    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }

    expect(
      result.variables.find((variable) => variable.name === "APP_NAME")
        ?.defaultValue,
    ).toBe("Custom Service");
    expect(
      result.variables.find((variable) => variable.name === "APP_ENV")
        ?.defaultValue,
    ).toBe("production");
  });

  it("accepts array-format environment values", () => {
    const compose = `
services:
  app:
    image: alpine:3.19
    environment:
      - APP_NAME=Custom Service
      - APP_ENV=production
`;

    const result = validateUploadedCustomCompose(compose);

    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }

    expect(result.variables.map((variable) => variable.name)).toEqual(
      expect.arrayContaining(["APP_NAME", "APP_ENV"]),
    );
    expect(
      result.variables.find((variable) => variable.name === "APP_NAME")
        ?.defaultValue,
    ).toBe("Custom Service");
  });

  it("accepts multiple services, volumes, and networks", () => {
    const issues = validateCustomComposeStructure(standardCompose);

    expect(issues).toEqual([]);
  });

  it("rejects empty compose content", () => {
    const result = validateUploadedCustomCompose("   \n  ");

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }

    expect(result.issues[0]?.message).toMatch(/empty/i);
  });

  it("rejects invalid yaml syntax", () => {
    const result = validateUploadedCustomCompose("services:\n  web: [");

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }

    expect(result.issues[0]?.path).toBe("root");
  });

  it("rejects compose without services", () => {
    const result = validateUploadedCustomCompose("networks: {}");

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }

    expect(result.issues.some((issue) => issue.path === "services")).toBe(true);
  });

  it("rejects services without image, build, or extends", () => {
    const issues = validateCustomComposeStructure(`
services:
  broken:
    ports:
      - "8080:80"
`);

    expect(issues).toEqual([
      {
        path: "services.broken",
        message: "Service must define image, build, or extends",
      },
    ]);
  });

  it("encodes compose yaml to base64 json payload", () => {
    const encoded = encodeComposeYamlToPayload(validCompose);
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as Record<string, unknown>;

    expect(decoded.services).toBeDefined();
    expect(decoded.version).toBeUndefined();
  });
});
