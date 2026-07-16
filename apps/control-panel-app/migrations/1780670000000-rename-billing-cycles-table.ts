import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameBillingCyclesTable1780670000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_cycles RENAME TO "billingCycles"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "billingCycles" RENAME TO billing_cycles
    `);
  }
}
