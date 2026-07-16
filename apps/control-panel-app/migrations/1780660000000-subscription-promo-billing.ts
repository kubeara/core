import { MigrationInterface, QueryRunner } from "typeorm";

export class SubscriptionPromoBilling1780660000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS "promoCode" varchar(100),
      ADD COLUMN IF NOT EXISTS "stripePromotionCodeId" varchar(255),
      ADD COLUMN IF NOT EXISTS "billingListAmount" numeric(10, 2),
      ADD COLUMN IF NOT EXISTS "billingDiscountAmount" numeric(10, 2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE subscriptions
      SET "billingListAmount" = "billingAmount"
      WHERE "billingListAmount" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscriptions
      DROP COLUMN IF EXISTS "promoCode",
      DROP COLUMN IF EXISTS "stripePromotionCodeId",
      DROP COLUMN IF EXISTS "billingListAmount",
      DROP COLUMN IF EXISTS "billingDiscountAmount"
    `);
  }
}
