import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdatePlansFeatures1780400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await queryRunner.query(`
      UPDATE plans SET
        name = 'Free',
        description = 'For individuals exploring Kubeara',
        "priceMonthly" = 0,
        features = '["Teams: 1","Team members: 1","RBAC: No","MCP server: None","Support: Community"]'::jsonb,
        "sortOrder" = 0,
        "updatedAt" = ${now}
      WHERE slug = 'free'
    `);

    await queryRunner.query(`
      UPDATE plans SET
        name = 'Starter',
        description = 'For small teams getting production-ready',
        "priceMonthly" = 5,
        features = '["Teams: 2","Team members: 10","RBAC: Yes","MCP server: Read","Support: Email"]'::jsonb,
        "sortOrder" = 1,
        "updatedAt" = ${now}
      WHERE slug = 'starter'
    `);

    await queryRunner.query(`
      UPDATE plans SET
        name = 'Pro',
        description = 'For growing teams with collaboration needs',
        "priceMonthly" = 29,
        features = '["Teams: 5","Team members: 25","Custom domain / white labelling: Yes","MCP server: Full","Includes all features of Starter"]'::jsonb,
        "sortOrder" = 2,
        "updatedAt" = ${now}
      WHERE slug = 'pro'
    `);

    await queryRunner.query(`
      UPDATE plans SET
        slug = 'max',
        name = 'Max',
        description = 'For advanced teams running at scale',
        "priceMonthly" = 99,
        features = '["Teams: Unlimited","Team members: Unlimited","Support: Priority","Includes all features of Pro"]'::jsonb,
        "sortOrder" = 3,
        "updatedAt" = ${now}
      WHERE slug = 'business'
    `);

    await queryRunner.query(`
      UPDATE plans SET
        name = 'Max',
        description = 'For advanced teams running at scale',
        "priceMonthly" = 99,
        features = '["Teams: Unlimited","Team members: Unlimited","Support: Priority","Includes all features of Pro"]'::jsonb,
        "sortOrder" = 3,
        "updatedAt" = ${now}
      WHERE slug = 'max'
    `);

    await queryRunner.query(`
      INSERT INTO plans (slug, name, description, "priceMonthly", "stripePriceId", features, "sortOrder", status, "createdAt", "updatedAt")
      SELECT 'enterprise', 'Enterprise', 'For compliance-heavy organizations', 0, NULL,
        '["Audit logs: Yes","SSO: Yes","LDAP: Yes","Support: Dedicated","Includes all features of Max"]'::jsonb,
        4, 'ACTIVE', ${now}, ${now}
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'enterprise')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await queryRunner.query(`DELETE FROM plans WHERE slug = 'enterprise'`);

    await queryRunner.query(`
      UPDATE plans SET
        slug = 'business',
        name = 'Business',
        description = 'For teams with advanced needs',
        "priceMonthly" = 15,
        features = '["Unlimited server connections","All templates","Dedicated support","MCP server access","Team management","Custom integrations"]'::jsonb,
        "sortOrder" = 3,
        "updatedAt" = ${now}
      WHERE slug = 'max'
    `);
  }
}
