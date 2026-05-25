import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class ServiceDeployments1779691315948 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "serviceDeployments",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "templateSlug",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "statusMessage",
            type: "text",
            isNullable: true,
          },
          {
            name: "lastError",
            type: "text",
            isNullable: true,
          },
          {
            name: "status",
            type: "varchar",
            length: "50",
            default: "'pending'",
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
      "serviceDeployments",
      new TableIndex({
        name: "IDX_service_deployments_template_slug",
        columnNames: ["templateSlug"],
      }),
    );

    await queryRunner.createForeignKey(
      "serviceDeployments",
      new TableForeignKey({
        columnNames: ["templateSlug"],
        referencedTableName: "serviceTemplates",
        referencedColumnNames: ["slug"],
        onDelete: "RESTRICT",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("serviceDeployments");

    const templateForeignKey = table?.foreignKeys.find(
      (fk) =>
        fk.columnNames.length === 1 && fk.columnNames[0] === "templateSlug",
    );

    if (templateForeignKey) {
      await queryRunner.dropForeignKey(
        "serviceDeployments",
        templateForeignKey,
      );
    }

    await queryRunner.dropIndex(
      "serviceDeployments",
      "IDX_service_deployments_template_slug",
    );

    await queryRunner.dropTable("serviceDeployments");
  }
}
