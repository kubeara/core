import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class CreatePlanTranslations1786200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "planTranslations",
        columns: [
          {
            name: "id",
            type: "uuid",
            isNullable: false,
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "planId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "locale",
            type: "varchar",
            length: "16",
            isNullable: false,
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
            isNullable: true,
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "features",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "status",
            type: "varchar",
            length: "50",
            default: "'ACTIVE'",
            isNullable: false,
          },
          {
            name: "metadata",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "createdAt",
            type: "bigint",
            isNullable: false,
          },
          {
            name: "updatedAt",
            type: "bigint",
            isNullable: false,
          },
          {
            name: "deletedAt",
            type: "bigint",
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys("planTranslations", [
      new TableForeignKey({
        columnNames: ["planId"],
        referencedTableName: "plans",
        referencedColumnNames: ["id"],
      }),
    ]);

    await queryRunner.createIndices("planTranslations", [
      new TableIndex({
        name: "IDX_planTranslations_planId",
        columnNames: ["planId"],
      }),
      new TableIndex({
        name: "IDX_planTranslations_planId_locale",
        columnNames: ["planId", "locale"],
        isUnique: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("planTranslations");
  }
}
