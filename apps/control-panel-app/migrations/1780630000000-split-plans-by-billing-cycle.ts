import { MigrationInterface, QueryRunner } from "typeorm";

export class SplitPlansByBillingCycle1780630000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await queryRunner.query(`
      ALTER TABLE plans
      ADD COLUMN IF NOT EXISTS "tierSlug" varchar(20)
    `);

    await queryRunner.query(`
      ALTER TABLE plans
      ADD COLUMN IF NOT EXISTS "billingCycle" varchar(20) NOT NULL DEFAULT 'monthly'
    `);

    await queryRunner.query(`
      ALTER TABLE plans
      ADD COLUMN IF NOT EXISTS "listPriceMonthly" numeric(10, 2)
    `);

    await queryRunner.query(`
      ALTER TABLE plans
      ALTER COLUMN "priceMonthly" TYPE numeric(10, 2)
      USING "priceMonthly"::numeric(10, 2)
    `);

    await queryRunner.query(`
      UPDATE plans SET
        "tierSlug" = 'free',
        "billingCycle" = 'monthly',
        "listPriceMonthly" = 0,
        "updatedAt" = ${now}
      WHERE slug = 'free'
    `);

    await queryRunner.query(`
      UPDATE plans SET
        "tierSlug" = 'enterprise',
        "billingCycle" = 'monthly',
        "listPriceMonthly" = 0,
        "updatedAt" = ${now}
      WHERE slug = 'enterprise'
    `);

    await queryRunner.query(`
      UPDATE plans SET
        slug = 'starter-monthly',
        "tierSlug" = 'starter',
        "billingCycle" = 'monthly',
        "priceMonthly" = 5,
        "listPriceMonthly" = 5,
        "stripePriceId" = COALESCE("billingPrices"->'monthly'->>'stripePriceId', "stripePriceId"),
        "billingPrices" = '{}'::jsonb,
        "updatedAt" = ${now}
      WHERE slug = 'starter'
    `);

    await queryRunner.query(`
      UPDATE plans SET
        slug = 'pro-monthly',
        "tierSlug" = 'pro',
        "billingCycle" = 'monthly',
        "priceMonthly" = 29,
        "listPriceMonthly" = 29,
        "stripePriceId" = COALESCE("billingPrices"->'monthly'->>'stripePriceId', "stripePriceId"),
        "billingPrices" = '{}'::jsonb,
        "updatedAt" = ${now}
      WHERE slug = 'pro'
    `);

    await queryRunner.query(`
      UPDATE plans SET
        slug = 'max-monthly',
        "tierSlug" = 'max',
        "billingCycle" = 'monthly',
        "priceMonthly" = 99,
        "listPriceMonthly" = 99,
        "stripePriceId" = COALESCE("billingPrices"->'monthly'->>'stripePriceId', "stripePriceId"),
        "billingPrices" = '{}'::jsonb,
        "updatedAt" = ${now}
      WHERE slug = 'max'
    `);

    await queryRunner.query(`
      INSERT INTO plans (
        slug, name, description, "priceMonthly", "listPriceMonthly", "stripePriceId",
        features, "sortOrder", status, "createdAt", "updatedAt", "tierSlug", "billingCycle", "billingPrices"
      )
      SELECT
        'starter-quarterly', name, description, 4.5, 5,
        'price_1TnXq6DwyDm0QIBwGUzpXv78',
        features, "sortOrder", status, ${now}, ${now}, 'starter', 'quarterly', '{}'::jsonb
      FROM plans WHERE slug = 'starter-monthly'
      ON CONFLICT (slug) DO UPDATE SET
        "priceMonthly" = EXCLUDED."priceMonthly",
        "listPriceMonthly" = EXCLUDED."listPriceMonthly",
        "stripePriceId" = EXCLUDED."stripePriceId",
        "tierSlug" = EXCLUDED."tierSlug",
        "billingCycle" = EXCLUDED."billingCycle",
        "updatedAt" = ${now}
    `);

    await queryRunner.query(`
      INSERT INTO plans (
        slug, name, description, "priceMonthly", "listPriceMonthly", "stripePriceId",
        features, "sortOrder", status, "createdAt", "updatedAt", "tierSlug", "billingCycle", "billingPrices"
      )
      SELECT
        'starter-yearly', name, description, 2.5, 5,
        'price_1TnXqpDwyDm0QIBwfHCm26Dv',
        features, "sortOrder", status, ${now}, ${now}, 'starter', 'yearly', '{}'::jsonb
      FROM plans WHERE slug = 'starter-monthly'
      ON CONFLICT (slug) DO UPDATE SET
        "priceMonthly" = EXCLUDED."priceMonthly",
        "listPriceMonthly" = EXCLUDED."listPriceMonthly",
        "stripePriceId" = EXCLUDED."stripePriceId",
        "tierSlug" = EXCLUDED."tierSlug",
        "billingCycle" = EXCLUDED."billingCycle",
        "updatedAt" = ${now}
    `);

    await queryRunner.query(`
      INSERT INTO plans (
        slug, name, description, "priceMonthly", "listPriceMonthly", "stripePriceId",
        features, "sortOrder", status, "createdAt", "updatedAt", "tierSlug", "billingCycle", "billingPrices"
      )
      SELECT
        'pro-quarterly', name, description, 26, 29,
        'price_1TnXsIDwyDm0QIBwDatasktJ',
        features, "sortOrder", status, ${now}, ${now}, 'pro', 'quarterly', '{}'::jsonb
      FROM plans WHERE slug = 'pro-monthly'
      ON CONFLICT (slug) DO UPDATE SET
        "priceMonthly" = EXCLUDED."priceMonthly",
        "listPriceMonthly" = EXCLUDED."listPriceMonthly",
        "stripePriceId" = EXCLUDED."stripePriceId",
        "tierSlug" = EXCLUDED."tierSlug",
        "billingCycle" = EXCLUDED."billingCycle",
        "updatedAt" = ${now}
    `);

    await queryRunner.query(`
      INSERT INTO plans (
        slug, name, description, "priceMonthly", "listPriceMonthly", "stripePriceId",
        features, "sortOrder", status, "createdAt", "updatedAt", "tierSlug", "billingCycle", "billingPrices"
      )
      SELECT
        'pro-yearly', name, description, 14.5, 29,
        'price_1TnXskDwyDm0QIBwlIB7orlk',
        features, "sortOrder", status, ${now}, ${now}, 'pro', 'yearly', '{}'::jsonb
      FROM plans WHERE slug = 'pro-monthly'
      ON CONFLICT (slug) DO UPDATE SET
        "priceMonthly" = EXCLUDED."priceMonthly",
        "listPriceMonthly" = EXCLUDED."listPriceMonthly",
        "stripePriceId" = EXCLUDED."stripePriceId",
        "tierSlug" = EXCLUDED."tierSlug",
        "billingCycle" = EXCLUDED."billingCycle",
        "updatedAt" = ${now}
    `);

    await queryRunner.query(`
      INSERT INTO plans (
        slug, name, description, "priceMonthly", "listPriceMonthly", "stripePriceId",
        features, "sortOrder", status, "createdAt", "updatedAt", "tierSlug", "billingCycle", "billingPrices"
      )
      SELECT
        'max-quarterly', name, description, 89, 99,
        'price_1TnXvPDwyDm0QIBwBIizb26l',
        features, "sortOrder", status, ${now}, ${now}, 'max', 'quarterly', '{}'::jsonb
      FROM plans WHERE slug = 'max-monthly'
      ON CONFLICT (slug) DO UPDATE SET
        "priceMonthly" = EXCLUDED."priceMonthly",
        "listPriceMonthly" = EXCLUDED."listPriceMonthly",
        "stripePriceId" = EXCLUDED."stripePriceId",
        "tierSlug" = EXCLUDED."tierSlug",
        "billingCycle" = EXCLUDED."billingCycle",
        "updatedAt" = ${now}
    `);

    await queryRunner.query(`
      INSERT INTO plans (
        slug, name, description, "priceMonthly", "listPriceMonthly", "stripePriceId",
        features, "sortOrder", status, "createdAt", "updatedAt", "tierSlug", "billingCycle", "billingPrices"
      )
      SELECT
        'max-yearly', name, description, 48.5, 99,
        'price_1TnXvlDwyDm0QIBwc7gcoSiq',
        features, "sortOrder", status, ${now}, ${now}, 'max', 'yearly', '{}'::jsonb
      FROM plans WHERE slug = 'max-monthly'
      ON CONFLICT (slug) DO UPDATE SET
        "priceMonthly" = EXCLUDED."priceMonthly",
        "listPriceMonthly" = EXCLUDED."listPriceMonthly",
        "stripePriceId" = EXCLUDED."stripePriceId",
        "tierSlug" = EXCLUDED."tierSlug",
        "billingCycle" = EXCLUDED."billingCycle",
        "updatedAt" = ${now}
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM plans
      WHERE slug IN (
        'starter-quarterly', 'starter-yearly',
        'pro-quarterly', 'pro-yearly',
        'max-quarterly', 'max-yearly'
      )
    `);

    await queryRunner.query(`
      UPDATE plans SET slug = 'starter' WHERE slug = 'starter-monthly'
    `);
    await queryRunner.query(`
      UPDATE plans SET slug = 'pro' WHERE slug = 'pro-monthly'
    `);
    await queryRunner.query(`
      UPDATE plans SET slug = 'max' WHERE slug = 'max-monthly'
    `);

    await queryRunner.query(`
      ALTER TABLE plans DROP COLUMN IF EXISTS "listPriceMonthly"
    `);
    await queryRunner.query(`
      ALTER TABLE plans DROP COLUMN IF EXISTS "billingCycle"
    `);
    await queryRunner.query(`
      ALTER TABLE plans DROP COLUMN IF EXISTS "tierSlug"
    `);
  }
}
