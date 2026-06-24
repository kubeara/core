import { MigrationInterface, QueryRunner } from "typeorm";

const FEATURES = {
  free: {
    serverLimit: 1,
    teams: 1,
    teamMembers: 1,
    rbac: false,
    mcpAccess: "none",
    support: "community",
  },
  starter: {
    serverLimit: 5,
    teams: 2,
    teamMembers: 10,
    rbac: true,
    mcpAccess: "read",
    support: "email",
  },
  pro: {
    serverLimit: 25,
    teams: 5,
    teamMembers: 25,
    rbac: true,
    mcpAccess: "full",
    support: "email",
    customDomain: true,
    inheritsFrom: "starter",
  },
  max: {
    serverLimit: "unlimited",
    teams: "unlimited",
    teamMembers: "unlimited",
    rbac: true,
    mcpAccess: "full",
    support: "priority",
    customDomain: true,
    inheritsFrom: "pro",
  },
  enterprise: {
    serverLimit: "unlimited",
    teams: "unlimited",
    teamMembers: "unlimited",
    rbac: true,
    mcpAccess: "full",
    support: "dedicated",
    customDomain: true,
    auditLogs: true,
    sso: true,
    ldap: true,
    inheritsFrom: "max",
  },
} as const;

export class PlanFeaturesObject1780500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    for (const [slug, features] of Object.entries(FEATURES)) {
      await queryRunner.query(
        `
        UPDATE plans SET
          features = $1::jsonb,
          "updatedAt" = $2
        WHERE slug = $3
      `,
        [JSON.stringify(features), now, slug],
      );
    }

    await queryRunner.query(`
      UPDATE plans SET
        slug = 'max',
        features = '${JSON.stringify(FEATURES.max)}'::jsonb,
        "updatedAt" = ${now}
      WHERE slug = 'business'
    `);

    await queryRunner.query(`
      INSERT INTO plans (slug, name, description, "priceMonthly", "stripePriceId", features, "sortOrder", status, "createdAt", "updatedAt")
      SELECT 'enterprise', 'Enterprise', 'For compliance-heavy organizations', 0, NULL,
        '${JSON.stringify(FEATURES.enterprise)}'::jsonb,
        4, 'ACTIVE', ${now}, ${now}
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'enterprise')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await queryRunner.query(`
      UPDATE plans SET
        features = '["Teams: 1","Team members: 1","RBAC: No","MCP server: None","Support: Community"]'::jsonb,
        "updatedAt" = ${now}
      WHERE slug = 'free'
    `);
  }
}
