import { MigrationInterface, QueryRunner } from "typeorm";

export class SubscriptionBillingAmountDecimal1780620000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscriptions
      ALTER COLUMN "billingAmount" TYPE numeric(10, 2)
      USING "billingAmount"::numeric(10, 2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscriptions
      ALTER COLUMN "billingAmount" TYPE int
      USING ROUND("billingAmount")::int
    `);
  }
}
