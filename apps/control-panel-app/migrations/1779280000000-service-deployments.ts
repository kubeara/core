import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from "typeorm";

export class ServiceDeployments1779280000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "serviceDeployments",
        columns: [
          {
            name: "id",
            type: "varchar",
            length: "128",
            isPrimary: true,
          },
          {
            name: "template_slug",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "status",
            type: "varchar",
            length: "32",
            default: "'pending'",
          },
          {
            name: "status_message",
            type: "text",
            isNullable: true,
          },
          {
            name: "last_error",
            type: "text",
            isNullable: true,
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "now()",
          },
          {
            name: "updated_at",
            type: "timestamptz",
            default: "now()",
          },
          {
            name: "deleted_at",
            type: "timestamptz",
            isNullable: true,
          },
        ],
      }),
    );

    await queryRunner.createIndex(
      "serviceDeployments",
      new TableIndex({
        name: "IDX_service_deployments_template_slug",
        columnNames: ["template_slug"],
      }),
    );

    await queryRunner.createIndex(
      "serviceDeployments",
      new TableIndex({
        name: "IDX_service_deployments_status",
        columnNames: ["status"],
      }),
    );

    await queryRunner.createForeignKey(
      "serviceDeployments",
      new TableForeignKey({
        columnNames: ["template_slug"],
        referencedColumnNames: ["slug"],
        referencedTableName: "serviceTemplates",
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "environmentVariables",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "deployment_id",
            type: "varchar",
            length: "128",
            isNullable: false,
          },
          {
            name: "key",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "value",
            type: "text",
            isNullable: false,
          },
          {
            name: "is_required",
            type: "boolean",
            default: false,
          },
          {
            name: "is_generated",
            type: "boolean",
            default: false,
          },
          {
            name: "comment",
            type: "text",
            isNullable: true,
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "now()",
          },
          {
            name: "updated_at",
            type: "timestamptz",
            default: "now()",
          },
        ],
      }),
    );

    await queryRunner.createIndex(
      "environmentVariables",
      new TableIndex({
        name: "IDX_environment_variables_deployment_id",
        columnNames: ["deployment_id"],
      }),
    );

    await queryRunner.createUniqueConstraint(
      "environmentVariables",
      new TableUnique({
        name: "UQ_environment_variables_deployment_id_key",
        columnNames: ["deployment_id", "key"],
      }),
    );

    await queryRunner.createForeignKey(
      "environmentVariables",
      new TableForeignKey({
        columnNames: ["deployment_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "serviceDeployments",
        onUpdate: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const envTable = await queryRunner.getTable("environmentVariables");
    if (envTable) {
      for (const fk of envTable.foreignKeys) {
        await queryRunner.dropForeignKey("environmentVariables", fk);
      }
    }
    await queryRunner.dropIndex(
      "environmentVariables",
      "IDX_environment_variables_deployment_id",
    );
    await queryRunner.dropUniqueConstraint(
      "environmentVariables",
      "UQ_environment_variables_deployment_id_key",
    );
    await queryRunner.dropTable("environmentVariables");

    const depTable = await queryRunner.getTable("serviceDeployments");
    if (depTable) {
      for (const fk of depTable.foreignKeys) {
        await queryRunner.dropForeignKey("serviceDeployments", fk);
      }
    }
    await queryRunner.dropIndex(
      "serviceDeployments",
      "IDX_service_deployments_status",
    );
    await queryRunner.dropIndex(
      "serviceDeployments",
      "IDX_service_deployments_template_slug",
    );
    await queryRunner.dropTable("serviceDeployments");
  }
}
