import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

/**
 * Adds agent health columns used by the cron health check:
 * isServerUp, lastAgentCheckedAt, retryCount, serverError, agentError.
 */
export class ServerAgentHealth1780300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns("servers", [
      new TableColumn({
        name: "isServerUp",
        type: "boolean",
        default: false,
        isNullable: false,
      }),
      new TableColumn({
        name: "lastAgentCheckedAt",
        type: "bigint",
        isNullable: true,
      }),
      new TableColumn({
        name: "retryCount",
        type: "integer",
        default: 0,
        isNullable: false,
      }),
      new TableColumn({
        name: "serverError",
        type: "jsonb",
        isNullable: true,
      }),
      new TableColumn({
        name: "agentError",
        type: "jsonb",
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns("servers", [
      "agentError",
      "serverError",
      "retryCount",
      "lastAgentCheckedAt",
      "isServerUp",
    ]);
  }
}
