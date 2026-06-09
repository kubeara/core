import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "@jest/globals";

import {
  getTemplateDescriptionFromComments,
  getTemplateLongDescriptionFromComments,
  parseTemplateCommentMetadata,
  parseTemplateVariables,
} from "./template-variables.util";

const templatesRoot = join(
  __dirname,
  "../../../../apps/control-panel-app/templates",
);

describe("template-variables.util", () => {
  const n8nCompose = `# documentation: https://n8n.io
# slogan: n8n workflow automation
# category: automation
# tags: automation,workflow
# port: 5678

services:
  n8n:
    ports:
      - '\${SERVICE_PORT_N8N:-5678}:5678'
    environment:
      - SERVICE_URL_N8N_5678
      - N8N_SECURE_COOKIE=\${N8N_SECURE_COOKIE:-false}
      - N8N_RUNNERS_AUTH_TOKEN=\${SERVICE_PASSWORD_N8N}
      - GENERIC_TIMEZONE=\${GENERIC_TIMEZONE:-UTC}
      - N8N_EDITOR_BASE_URL=\${SERVICE_URL_N8N:-\${SERVICE_URL_N8N_5678}}
`;

  it("parses comment metadata", () => {
    expect(parseTemplateCommentMetadata(n8nCompose)).toEqual({
      documentation: "https://n8n.io",
      slogan: "n8n workflow automation",
      category: ["automation"],
      tags: ["automation", "workflow"],
      port: 5678,
    });
  });

  it("parses description comment key and resolves description from comments", () => {
    const compose = `# description: Advanced open source relational database
# category: database

services:
  postgres:
    image: postgres:16
`;

    const metadata = parseTemplateCommentMetadata(compose);

    expect(metadata.description).toBe(
      "Advanced open source relational database",
    );
    expect(getTemplateDescriptionFromComments(metadata)).toBe(
      "Advanced open source relational database",
    );
    expect(metadata.category).toEqual(["database"]);
  });

  it("parses shortDescription and longDescription comment keys", () => {
    const compose = `# shortDescription: In-memory data structure store
# longDescription: <p>Redis is a fast in-memory store.</p>

services:
  redis:
    image: redis:7
`;

    const metadata = parseTemplateCommentMetadata(compose);

    expect(getTemplateDescriptionFromComments(metadata)).toBe(
      "In-memory data structure store",
    );
    expect(getTemplateLongDescriptionFromComments(metadata)).toBe(
      "<p>Redis is a fast in-memory store.</p>",
    );
  });

  it("parses comma-separated category values into an array", () => {
    expect(
      parseTemplateCommentMetadata(`# category: database,postgresql,sql

services:
  postgres:
    image: postgres:16
`),
    ).toEqual({
      category: ["database", "postgresql", "sql"],
    });
  });

  it("parses deduplicated variables with occurrence-based required flags", () => {
    const variables = parseTemplateVariables(n8nCompose);
    const byName = Object.fromEntries(
      variables.map((variable) => [variable.name, variable]),
    );

    expect(byName.SERVICE_PORT_N8N).toEqual({
      name: "SERVICE_PORT_N8N",
      type: "number",
      required: false,
      defaultValue: 5678,
      hasRequiredOccurrence: false,
      hasDefaultSyntax: true,
    });

    expect(byName.SERVICE_PASSWORD_N8N).toEqual({
      name: "SERVICE_PASSWORD_N8N",
      type: "string",
      required: true,
      defaultValue: null,
      hasRequiredOccurrence: true,
      hasDefaultSyntax: false,
    });

    expect(byName.N8N_SECURE_COOKIE).toEqual({
      name: "N8N_SECURE_COOKIE",
      type: "boolean",
      required: false,
      defaultValue: false,
      hasRequiredOccurrence: false,
      hasDefaultSyntax: true,
    });

    expect(byName.GENERIC_TIMEZONE).toEqual({
      name: "GENERIC_TIMEZONE",
      type: "string",
      required: false,
      defaultValue: "UTC",
      hasRequiredOccurrence: false,
      hasDefaultSyntax: true,
    });

    expect(byName.SERVICE_URL_N8N).toBeUndefined();
    expect(byName.SERVICE_URL_N8N_5678).toBeUndefined();
  });

  it("infers numeric port defaults from postgres-style compose", () => {
    const postgresCompose = `# port: 5432
services:
  postgres:
    image: \${POSTGRES_IMAGE:-postgres:16}
    ports:
      - '\${SERVICE_PORT_POSTGRES:-5432}:5432'
    environment:
      POSTGRES_USER: \${SERVICE_USER_POSTGRES}
      TZ: \${TZ:-UTC}
`;

    const variables = parseTemplateVariables(postgresCompose);
    const byName = Object.fromEntries(
      variables.map((variable) => [variable.name, variable]),
    );

    expect(byName.SERVICE_PORT_POSTGRES).toEqual({
      name: "SERVICE_PORT_POSTGRES",
      type: "number",
      required: false,
      defaultValue: 5432,
      hasRequiredOccurrence: false,
      hasDefaultSyntax: true,
    });

    expect(byName.POSTGRES_IMAGE).toEqual({
      name: "POSTGRES_IMAGE",
      type: "string",
      required: false,
      defaultValue: "postgres:16",
      hasRequiredOccurrence: false,
      hasDefaultSyntax: true,
    });

    expect(byName.TZ).toEqual({
      name: "TZ",
      type: "string",
      required: false,
      defaultValue: "UTC",
      hasRequiredOccurrence: false,
      hasDefaultSyntax: true,
    });

    expect(byName.SERVICE_USER_POSTGRES).toEqual({
      name: "SERVICE_USER_POSTGRES",
      type: "string",
      required: true,
      defaultValue: null,
      hasRequiredOccurrence: true,
      hasDefaultSyntax: false,
    });
  });

  it("marks variables without :- as required with null defaultValue", () => {
    const compose = `
services:
  app:
    environment:
      REQUIRED_VAR: \${REQUIRED_VAR}
      OPTIONAL_VAR: \${OPTIONAL_VAR:-fallback}
`;

    const byName = Object.fromEntries(
      parseTemplateVariables(compose).map((variable) => [
        variable.name,
        variable,
      ]),
    );

    expect(byName.REQUIRED_VAR).toEqual({
      name: "REQUIRED_VAR",
      type: "string",
      required: true,
      defaultValue: null,
      hasRequiredOccurrence: true,
      hasDefaultSyntax: false,
    });

    expect(byName.OPTIONAL_VAR).toEqual({
      name: "OPTIONAL_VAR",
      type: "string",
      required: false,
      defaultValue: "fallback",
      hasRequiredOccurrence: false,
      hasDefaultSyntax: true,
    });
  });

  it("treats empty :- default as optional with null defaultValue", () => {
    const compose = `
services:
  app:
    environment:
      EMPTY_DEFAULT: \${EMPTY_DEFAULT:-}
`;

    const [variable] = parseTemplateVariables(compose);

    expect(variable).toEqual({
      name: "EMPTY_DEFAULT",
      type: "string",
      required: false,
      defaultValue: null,
      hasRequiredOccurrence: false,
      hasDefaultSyntax: true,
    });
  });

  it("requires a variable when any occurrence lacks :- default syntax", () => {
    const compose = `
services:
  app:
    environment:
      MIXED_VAR: \${MIXED_VAR}
      OTHER: \${MIXED_VAR:-default}
`;

    const [variable] = parseTemplateVariables(compose);

    expect(variable).toEqual({
      name: "MIXED_VAR",
      type: "string",
      required: true,
      defaultValue: null,
      hasRequiredOccurrence: true,
      hasDefaultSyntax: true,
    });
  });

  it("keeps required:true and defaultValue:null consistent across all variables", () => {
    for (const variable of parseTemplateVariables(n8nCompose)) {
      if (variable.required) {
        expect(variable.defaultValue).toBeNull();
        expect(variable.hasRequiredOccurrence).toBe(true);
      } else {
        expect(variable.hasRequiredOccurrence).toBe(false);
      }
    }
  });

  it("parses real postgresql, redis, and n8n marketplace templates", () => {
    const postgres = readFileSync(
      join(templatesRoot, "postgresql/docker-compose.yml"),
      "utf8",
    );
    const redis = readFileSync(
      join(templatesRoot, "redis/docker-compose.yml"),
      "utf8",
    );
    const n8n = readFileSync(
      join(templatesRoot, "n8n/docker-compose.yml"),
      "utf8",
    );

    const postgresByName = Object.fromEntries(
      parseTemplateVariables(postgres).map((variable) => [
        variable.name,
        variable,
      ]),
    );
    const redisByName = Object.fromEntries(
      parseTemplateVariables(redis).map((variable) => [
        variable.name,
        variable,
      ]),
    );
    const n8nByName = Object.fromEntries(
      parseTemplateVariables(n8n).map((variable) => [variable.name, variable]),
    );

    expect(postgresByName.SERVICE_PORT_POSTGRES).toMatchObject({
      required: true,
      hasRequiredOccurrence: true,
      defaultValue: null,
    });
    expect(postgresByName.SERVICE_PASSWORD_POSTGRES).toMatchObject({
      required: true,
      hasRequiredOccurrence: true,
      defaultValue: null,
    });
    expect(postgresByName.SERVICE_USER_POSTGRES).toMatchObject({
      required: true,
      hasRequiredOccurrence: true,
      defaultValue: null,
    });
    expect(postgresByName.POSTGRES_IMAGE).toMatchObject({
      required: false,
      hasRequiredOccurrence: false,
      defaultValue: "postgres:16",
    });

    expect(redisByName.SERVICE_PORT_REDIS).toMatchObject({
      required: false,
      hasRequiredOccurrence: false,
      defaultValue: 6379,
    });
    expect(redisByName.SERVICE_PASSWORD_REDIS).toMatchObject({
      required: true,
      hasRequiredOccurrence: true,
      defaultValue: null,
    });

    expect(n8nByName.SERVICE_PORT_N8N).toMatchObject({
      required: false,
      hasRequiredOccurrence: false,
      defaultValue: 5678,
    });
    expect(n8nByName.SERVICE_PASSWORD_N8N).toMatchObject({
      required: true,
      hasRequiredOccurrence: true,
      defaultValue: null,
    });
    expect(n8nByName.N8N_RUNNERS_BROKER_PORT).toMatchObject({
      required: false,
      hasRequiredOccurrence: false,
      defaultValue: 5679,
    });
    expect(n8nByName.GENERIC_TIMEZONE).toMatchObject({
      required: false,
      hasRequiredOccurrence: false,
      defaultValue: "UTC",
    });
  });

  it("does not treat hyphens inside default values as :- syntax", () => {
    const compose = `
services:
  postgres:
    restart: \${POSTGRES_RESTART_POLICY:-unless-stopped}
`;

    const [variable] = parseTemplateVariables(compose);

    expect(variable).toEqual({
      name: "POSTGRES_RESTART_POLICY",
      type: "string",
      required: false,
      defaultValue: "unless-stopped",
      hasRequiredOccurrence: false,
      hasDefaultSyntax: true,
    });
  });
});
