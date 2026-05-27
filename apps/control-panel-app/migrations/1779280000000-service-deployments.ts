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
            name: "templateSlug",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "serverId",
            type: "uuid",
            isNullable: true,
          },
          {
            name: "userId",
            type: "uuid",
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
            name: "deploymentStatus",
            type: "varchar",
            length: "32",
            default: "'pending'",
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
    );

    await queryRunner.createIndex(
      "serviceDeployments",
      new TableIndex({
        name: "IDX_service_deployments_templateSlug",
        columnNames: ["templateSlug"],
      }),
    );

    await queryRunner.createIndex(
      "serviceDeployments",
      new TableIndex({
        name: "IDX_service_deployments_deploymentStatus",
        columnNames: ["deploymentStatus"],
      }),
    );

    await queryRunner.createIndex(
      "serviceDeployments",
      new TableIndex({
        name: "IDX_service_deployments_serverId",
        columnNames: ["serverId"],
      }),
    );

    await queryRunner.createIndex(
      "serviceDeployments",
      new TableIndex({
        name: "IDX_service_deployments_userId",
        columnNames: ["userId"],
      }),
    );

    await queryRunner.createForeignKey(
      "serviceDeployments",
      new TableForeignKey({
        name: "FK_service_deployments_templateSlug",
        columnNames: ["templateSlug"],
        referencedColumnNames: ["slug"],
        referencedTableName: "serviceTemplates",
      }),
    );

    await queryRunner.createForeignKey(
      "serviceDeployments",
      new TableForeignKey({
        name: "FK_service_deployments_serverId",
        columnNames: ["serverId"],
        referencedTableName: "servers",
        referencedColumnNames: ["id"],
      }),
    );

    await queryRunner.createForeignKey(
      "serviceDeployments",
      new TableForeignKey({
        name: "FK_service_deployments_userId",
        columnNames: ["userId"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
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
            name: "deploymentId",
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
            name: "isRequired",
            type: "boolean",
            default: false,
          },
          {
            name: "isGenerated",
            type: "boolean",
            default: false,
          },
          {
            name: "comment",
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
    );

    await queryRunner.createIndex(
      "environmentVariables",
      new TableIndex({
        name: "IDX_environment_variables_deploymentId",
        columnNames: ["deploymentId"],
      }),
    );

    await queryRunner.createUniqueConstraint(
      "environmentVariables",
      new TableUnique({
        name: "UQ_environment_variables_deploymentId_key",
        columnNames: ["deploymentId", "key"],
      }),
    );

    await queryRunner.createForeignKey(
      "environmentVariables",
      new TableForeignKey({
        name: "FK_environment_variables_deploymentId",
        columnNames: ["deploymentId"],
        referencedColumnNames: ["id"],
        referencedTableName: "serviceDeployments",
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
      "IDX_environment_variables_deploymentId",
    );
    await queryRunner.dropUniqueConstraint(
      "environmentVariables",
      "UQ_environment_variables_deploymentId_key",
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
      "IDX_service_deployments_userId",
    );
    await queryRunner.dropIndex(
      "serviceDeployments",
      "IDX_service_deployments_serverId",
    );
    await queryRunner.dropIndex(
      "serviceDeployments",
      "IDX_service_deployments_deploymentStatus",
    );
    await queryRunner.dropIndex(
      "serviceDeployments",
      "IDX_service_deployments_templateSlug",
    );
    await queryRunner.dropTable("serviceDeployments");
  }
}
