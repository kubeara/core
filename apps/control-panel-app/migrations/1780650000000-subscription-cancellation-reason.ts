import { MigrationInterface, QueryRunner } from "typeorm";

export class SubscriptionCancellationReason1780650000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS "cancellationReason" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscriptions
      DROP COLUMN IF EXISTS "cancellationReason"
    `);
  }
}
