import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class ServiceDeploymentsServerId1779721000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "serverTypeEnum" ADD VALUE IF NOT EXISTS 'LOCAL'`,
    );

    await queryRunner.addColumn(
      "serviceDeployments",
      new TableColumn({
        name: "server_id",
        type: "uuid",
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      "serviceDeployments",
      new TableColumn({
        name: "userId",
        type: "uuid",
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      "serviceDeployments",
      new TableIndex({
        name: "IDX_service_deployments_server_id",
        columnNames: ["server_id"],
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
        name: "FK_service_deployments_server_id",
        columnNames: ["server_id"],
        referencedTableName: "servers",
        referencedColumnNames: ["id"],
        onDelete: "RESTRICT",
      }),
    );

    await queryRunner.createForeignKey(
      "serviceDeployments",
      new TableForeignKey({
        name: "FK_service_deployments_userId",
        columnNames: ["userId"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
        onDelete: "RESTRICT",
      }),
    );

    /*
     * Backfill userId from the owning server where possible.
     */
    await queryRunner.query(`
      UPDATE "serviceDeployments" d
      SET "userId" = s."userId"
      FROM servers s
      WHERE d.server_id = s.id
        AND d."userId" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(
      "serviceDeployments",
      "FK_service_deployments_userId",
    );
    await queryRunner.dropForeignKey(
      "serviceDeployments",
      "FK_service_deployments_server_id",
    );
    await queryRunner.dropIndex(
      "serviceDeployments",
      "IDX_service_deployments_userId",
    );
    await queryRunner.dropIndex(
      "serviceDeployments",
      "IDX_service_deployments_server_id",
    );
    await queryRunner.dropColumn("serviceDeployments", "userId");
    await queryRunner.dropColumn("serviceDeployments", "server_id");
  }
}
