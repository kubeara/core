import { MigrationInterface, QueryRunner } from "typeorm";

export class ServiceTemplatesDescriptions1779730000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "serviceTemplates"
      ADD COLUMN "shortDescription" text
    `);

    await queryRunner.query(`
      ALTER TABLE "serviceTemplates"
      ADD COLUMN "longDescription" text
    `);

    await queryRunner.query(`
      UPDATE "serviceTemplates"
      SET "shortDescription" = "description"
      WHERE "description" IS NOT NULL
        AND trim("description") <> ''
    `);

    await queryRunner.query(`
      ALTER TABLE "serviceTemplates"
      DROP COLUMN "description"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "serviceTemplates"
      ADD COLUMN "description" text
    `);

    await queryRunner.query(`
      UPDATE "serviceTemplates"
      SET "description" = "shortDescription"
      WHERE "shortDescription" IS NOT NULL
        AND trim("shortDescription") <> ''
    `);

    await queryRunner.query(`
      ALTER TABLE "serviceTemplates"
      DROP COLUMN "shortDescription"
    `);

    await queryRunner.query(`
      ALTER TABLE "serviceTemplates"
      DROP COLUMN "longDescription"
    `);
  }
}
