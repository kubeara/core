import { MigrationInterface, QueryRunner, TableUnique } from "typeorm";

export class AddUniqueHostPortToServers1779363919720 implements MigrationInterface {
  name = "AddUniqueHostPortToServers1779363919720";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add composite unique constraint
    await queryRunner.createUniqueConstraint(
      "servers",
      new TableUnique({
        name: "UQ_server_host_port",
        columnNames: ["host", "port"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove composite unique constraint
    await queryRunner.dropUniqueConstraint("servers", "UQ_server_host_port");
  }
}
