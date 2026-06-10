import { MigrationInterface, QueryRunner } from "typeorm";

export class ServiceTemplatesCategoryArray1779720000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_serviceTemplates_category"
    `);

    await queryRunner.query(`
      ALTER TABLE "serviceTemplates"
      ALTER COLUMN "category" TYPE text[]
      USING (
        CASE
          WHEN "category" IS NULL THEN NULL
          WHEN trim("category"::text) = '' THEN NULL
          ELSE ARRAY[trim("category"::text)]
        END
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_serviceTemplates_category"
      ON "serviceTemplates" USING GIN ("category")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_serviceTemplates_category"
    `);

    await queryRunner.query(`
      ALTER TABLE "serviceTemplates"
      ALTER COLUMN "category" TYPE varchar(100)
      USING (
        CASE
          WHEN "category" IS NULL THEN NULL
          WHEN array_length("category", 1) IS NULL THEN NULL
          ELSE left("category"[1], 100)
        END
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_serviceTemplates_category"
      ON "serviceTemplates" ("category")
    `);
  }
}
