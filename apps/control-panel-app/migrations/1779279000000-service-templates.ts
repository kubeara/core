import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class ServiceTemplates1779279000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "serviceTemplates",
        columns: [
          {
            name: "id",
            type: "uuid",
            isNullable: false,
            isUnique: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "slug",
            type: "varchar",
            length: "255",
            isPrimary: true,
            isNullable: false,
          },
          {
            name: "name",
            type: "text",
            isNullable: false,
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "category",
            type: "varchar",
            length: "100",
            isNullable: true,
          },
          {
            name: "tags",
            type: "text",
            isArray: true,
            isNullable: true,
          },
          {
            name: "documentation",
            type: "text",
            isNullable: true,
          },
          {
            name: "logo",
            type: "text",
            isNullable: true,
          },
          {
            name: "compose",
            type: "text",
            isNullable: false,
          },
          {
            name: "env_schema",
            type: "json",
            isNullable: true,
          },
          {
            name: "port_schema",
            type: "json",
            isNullable: true,
          },
          {
            name: "port",
            type: "integer",
            isNullable: true,
          },
          {
            name: "version",
            type: "varchar",
            length: "50",
            isNullable: true,
          },
          {
            name: "is_active",
            type: "boolean",
            default: true,
            isNullable: false,
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

    await queryRunner.createIndex(
      "serviceTemplates",
      new TableIndex({
        name: "IDX_serviceTemplates_category",
        columnNames: ["category"],
      }),
    );

    await queryRunner.createIndex(
      "serviceTemplates",
      new TableIndex({
        name: "IDX_serviceTemplates_is_active",
        columnNames: ["is_active"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "serviceTemplates",
      "IDX_serviceTemplates_is_active",
    );

    await queryRunner.dropIndex(
      "serviceTemplates",
      "IDX_serviceTemplates_category",
    );

    await queryRunner.dropTable("serviceTemplates");
  }
}
