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
        name: "service_deployments",
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
      "service_deployments",
      new TableIndex({
        name: "IDX_service_deployments_template_slug",
        columnNames: ["template_slug"],
      }),
    );

    await queryRunner.createIndex(
      "service_deployments",
      new TableIndex({
        name: "IDX_service_deployments_status",
        columnNames: ["status"],
      }),
    );

    await queryRunner.createForeignKey(
      "service_deployments",
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
        name: "environment_variables",
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
      "environment_variables",
      new TableIndex({
        name: "IDX_environment_variables_deployment_id",
        columnNames: ["deployment_id"],
      }),
    );

    await queryRunner.createUniqueConstraint(
      "environment_variables",
      new TableUnique({
        name: "UQ_environment_variables_deployment_id_key",
        columnNames: ["deployment_id", "key"],
      }),
    );

    await queryRunner.createForeignKey(
      "environment_variables",
      new TableForeignKey({
        columnNames: ["deployment_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "service_deployments",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const envTable = await queryRunner.getTable("environment_variables");
    if (envTable) {
      for (const fk of envTable.foreignKeys) {
        await queryRunner.dropForeignKey("environment_variables", fk);
      }
    }
    await queryRunner.dropIndex(
      "environment_variables",
      "IDX_environment_variables_deployment_id",
    );
    await queryRunner.dropUniqueConstraint(
      "environment_variables",
      "UQ_environment_variables_deployment_id_key",
    );
    await queryRunner.dropTable("environment_variables");

    const depTable = await queryRunner.getTable("service_deployments");
    if (depTable) {
      for (const fk of depTable.foreignKeys) {
        await queryRunner.dropForeignKey("service_deployments", fk);
      }
    }
    await queryRunner.dropIndex(
      "service_deployments",
      "IDX_service_deployments_status",
    );
    await queryRunner.dropIndex(
      "service_deployments",
      "IDX_service_deployments_template_slug",
    );
    await queryRunner.dropTable("service_deployments");
  }
}
