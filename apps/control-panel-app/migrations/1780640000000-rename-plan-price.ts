import { MigrationInterface, QueryRunner } from "typeorm";

export class RenamePlanPrice1780640000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await queryRunner.query(`
      ALTER TABLE plans
      RENAME COLUMN "priceMonthly" TO price
    `);

    await queryRunner.query(`
      ALTER TABLE plans
      RENAME COLUMN "listPriceMonthly" TO "listPrice"
    `);

    await queryRunner.query(`
      UPDATE plans SET price = 13.5, "listPrice" = 15, "updatedAt" = ${now}
      WHERE slug = 'starter-quarterly'
    `);
    await queryRunner.query(`
      UPDATE plans SET price = 30, "listPrice" = 60, "updatedAt" = ${now}
      WHERE slug = 'starter-yearly'
    `);
    await queryRunner.query(`
      UPDATE plans SET price = 78, "listPrice" = 87, "updatedAt" = ${now}
      WHERE slug = 'pro-quarterly'
    `);
    await queryRunner.query(`
      UPDATE plans SET price = 174, "listPrice" = 348, "updatedAt" = ${now}
      WHERE slug = 'pro-yearly'
    `);
    await queryRunner.query(`
      UPDATE plans SET price = 267, "listPrice" = 297, "updatedAt" = ${now}
      WHERE slug = 'max-quarterly'
    `);
    await queryRunner.query(`
      UPDATE plans SET price = 582, "listPrice" = 1188, "updatedAt" = ${now}
      WHERE slug = 'max-yearly'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE plans
      RENAME COLUMN price TO "priceMonthly"
    `);
    await queryRunner.query(`
      ALTER TABLE plans
      RENAME COLUMN "listPrice" TO "listPriceMonthly"
    `);
  }
}
