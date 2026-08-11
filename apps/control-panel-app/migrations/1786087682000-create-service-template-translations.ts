import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class CreateServiceTemplateTranslations1786087682000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "serviceTemplateTranslations",
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
            name: "serviceTemplateId",
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
            name: "category",
            type: "text",
            isArray: true,
            isNullable: true,
          },
          {
            name: "tags",
            type: "text",
            isArray: true,
            isNullable: true,
          },
          {
            name: "shortDescription",
            type: "text",
            isNullable: true,
          },
          {
            name: "longDescription",
            type: "text",
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

    await queryRunner.createForeignKeys("serviceTemplateTranslations", [
      new TableForeignKey({
        columnNames: ["serviceTemplateId"],
        referencedTableName: "serviceTemplates",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
    ]);

    await queryRunner.createIndices("serviceTemplateTranslations", [
      new TableIndex({
        name: "IDX_serviceTemplateTranslations_serviceTemplateId",
        columnNames: ["serviceTemplateId"],
      }),
      new TableIndex({
        name: "IDX_serviceTemplateTranslations_serviceTemplateId_locale",
        columnNames: ["serviceTemplateId", "locale"],
        isUnique: true,
      }),
      new TableIndex({
        name: "IDX_serviceTemplateTranslations_category",
        columnNames: ["category"],
        type: "gin",
      }),
      new TableIndex({
        name: "IDX_serviceTemplateTranslations_tags",
        columnNames: ["tags"],
        type: "gin",
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("serviceTemplateTranslations");
  }
}
