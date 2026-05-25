import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from "typeorm";

export class EnvironmentVariables1779691340900 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
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
            type: "uuid",
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
            isNullable: false,
          },
          {
            name: "isGenerated",
            type: "boolean",
            default: false,
            isNullable: false,
          },
          {
            name: "comment",
            type: "text",
            isNullable: true,
          },
          {
            name: "status",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "metadata",
            type: "jsonb",
            isNullable: false,
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
      "environmentVariables",
      new TableIndex({
        name: "IDX_environment_variables_deployment_id",
        columnNames: ["deploymentId"],
      }),
    );

    await queryRunner.createUniqueConstraint(
      "environmentVariables",
      new TableUnique({
        name: "UQ_environment_variables_deployment_key",
        columnNames: ["deploymentId", "key"],
      }),
    );

    await queryRunner.createForeignKey(
      "environmentVariables",
      new TableForeignKey({
        columnNames: ["deploymentId"],
        referencedTableName: "serviceDeployments",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("environmentVariables");

    const deploymentForeignKey = table?.foreignKeys.find(
      (fk) =>
        fk.columnNames.length === 1 && fk.columnNames[0] === "deploymentId",
    );

    if (deploymentForeignKey) {
      await queryRunner.dropForeignKey(
        "environmentVariables",
        deploymentForeignKey,
      );
    }

    await queryRunner.dropUniqueConstraint(
      "environmentVariables",
      "UQ_environment_variables_deployment_key",
    );

    await queryRunner.dropIndex(
      "environmentVariables",
      "IDX_environment_variables_deployment_id",
    );

    await queryRunner.dropTable("environmentVariables");
  }
}
