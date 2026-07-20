import { MigrationInterface, QueryRunner, TableUnique } from "typeorm";

/**
 * Removes the global (host, username) unique constraint so the same
 * physical host can be onboarded by multiple users.
 */
export class DropServersHostUsernameUnique1784110676007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropUniqueConstraint(
      "servers",
      "servers_host_username_unique",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createUniqueConstraint(
      "servers",
      new TableUnique({
        name: "servers_host_username_unique",
        columnNames: ["host", "username"],
      }),
    );
  }
}
