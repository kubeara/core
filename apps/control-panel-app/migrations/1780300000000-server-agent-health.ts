import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class ServerAgentHealth1780300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "servers",
      new TableColumn({
        name: "isServerUp",
        type: "boolean",
        default: false,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      "servers",
      new TableColumn({
        name: "lastAgentCheckedAt",
        type: "bigint",
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      "servers",
      new TableColumn({
        name: "retryCount",
        type: "integer",
        default: 0,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      "servers",
      new TableColumn({
        name: "serverError",
        type: "jsonb",
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      "servers",
      new TableColumn({
        name: "agentError",
        type: "jsonb",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("servers", "agentError");
    await queryRunner.dropColumn("servers", "serverError");
    await queryRunner.dropColumn("servers", "retryCount");
    await queryRunner.dropColumn("servers", "lastAgentCheckedAt");
    await queryRunner.dropColumn("servers", "isServerUp");
  }
}
