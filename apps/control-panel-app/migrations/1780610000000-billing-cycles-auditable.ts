import { MigrationInterface, QueryRunner } from "typeorm";

export class BillingCyclesAuditable1780610000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_cycles
      ADD COLUMN IF NOT EXISTS metadata jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE billing_cycles
      ADD COLUMN IF NOT EXISTS "deletedAt" bigint
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_cycles DROP COLUMN IF EXISTS "deletedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE billing_cycles DROP COLUMN IF EXISTS metadata
    `);
  }
}
