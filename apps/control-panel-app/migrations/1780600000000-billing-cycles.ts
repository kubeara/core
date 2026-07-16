import { MigrationInterface, QueryRunner } from "typeorm";

export class BillingCycles1780600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billing_cycles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar(20) NOT NULL UNIQUE,
        label varchar(50) NOT NULL,
        badge varchar(50),
        "discountPercent" int NOT NULL DEFAULT 0,
        "sortOrder" int NOT NULL DEFAULT 0,
        status varchar(20) NOT NULL DEFAULT 'active',
        "createdAt" bigint NOT NULL DEFAULT ${now},
        "updatedAt" bigint NOT NULL DEFAULT ${now}
      )
    `);

    await queryRunner.query(`
      INSERT INTO billing_cycles (slug, label, badge, "discountPercent", "sortOrder", status, "createdAt", "updatedAt")
      VALUES
        ('monthly', 'Monthly', NULL, 0, 0, 'active', ${now}, ${now}),
        ('quarterly', 'Quarterly', NULL, 10, 1, 'active', ${now}, ${now}),
        ('yearly', 'Yearly', 'Save 50%', 50, 2, 'active', ${now}, ${now})
      ON CONFLICT (slug) DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE plans
      ADD COLUMN IF NOT EXISTS "billingPrices" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);

    await queryRunner.query(`
      UPDATE plans SET "billingPrices" = jsonb_build_object(
        'monthly', jsonb_build_object(
          'amountMonthly', "priceMonthly",
          'stripePriceId', "stripePriceId"
        ),
        'yearly', jsonb_build_object(
          'amountMonthly', CASE slug
            WHEN 'starter' THEN 2.5
            WHEN 'pro' THEN 14.5
            WHEN 'max' THEN 48.5
            ELSE ROUND("priceMonthly" * 0.5)
          END,
          'stripePriceId', CASE slug
            WHEN 'starter' THEN 'price_1TnXqpDwyDm0QIBwfHCm26Dv'
            WHEN 'pro' THEN 'price_1TnXskDwyDm0QIBwlIB7orlk'
            WHEN 'max' THEN 'price_1TnXvlDwyDm0QIBwc7gcoSiq'
            ELSE NULL
          END
        ),
        'quarterly', jsonb_build_object(
          'amountMonthly', CASE slug
            WHEN 'starter' THEN 4.5
            WHEN 'pro' THEN 26
            WHEN 'max' THEN 89
            ELSE ROUND("priceMonthly" * 0.9)
          END,
          'stripePriceId', CASE slug
            WHEN 'starter' THEN 'price_1TnXq6DwyDm0QIBwGUzpXv78'
            WHEN 'pro' THEN 'price_1TnXsIDwyDm0QIBwDatasktJ'
            WHEN 'max' THEN 'price_1TnXvPDwyDm0QIBwBIizb26l'
            ELSE NULL
          END
        )
      ),
      "updatedAt" = ${now}
      WHERE slug IN ('starter', 'pro', 'max')
    `);

    await queryRunner.query(`
      UPDATE plans SET "billingPrices" = jsonb_build_object(
        'monthly', jsonb_build_object(
          'amountMonthly', "priceMonthly",
          'stripePriceId', "stripePriceId"
        )
      ),
      "updatedAt" = ${now}
      WHERE slug IN ('free', 'enterprise')
    `);

    await queryRunner.query(`
      ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS "billingCycle" varchar(20) NOT NULL DEFAULT 'monthly'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscriptions DROP COLUMN IF EXISTS "billingCycle"
    `);
    await queryRunner.query(`
      ALTER TABLE plans DROP COLUMN IF EXISTS "billingPrices"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS billing_cycles`);
  }
}
