import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class SelfHostInstallations1785845114404 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "selfHostInstallations",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "installationId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "eventType",
            type: "varchar",
            length: "32",
            isNullable: false,
          },
          {
            name: "version",
            type: "varchar",
            length: "64",
            isNullable: false,
          },
          {
            name: "previousVersion",
            type: "varchar",
            length: "64",
            isNullable: true,
          },
          {
            name: "ipAddress",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "userAgent",
            type: "varchar",
            length: "512",
            isNullable: true,
          },
          {
            name: "os",
            type: "varchar",
            length: "128",
            isNullable: true,
          },
          {
            name: "osVersion",
            type: "varchar",
            length: "128",
            isNullable: true,
          },
          {
            name: "architecture",
            type: "varchar",
            length: "64",
            isNullable: true,
          },
          {
            name: "dockerVersion",
            type: "varchar",
            length: "64",
            isNullable: true,
          },
          {
            name: "composeVersion",
            type: "varchar",
            length: "64",
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
      true,
    );

    await queryRunner.createIndex(
      "selfHostInstallations",
      new TableIndex({
        name: "IDX_self_host_installations_installationId",
        columnNames: ["installationId"],
      }),
    );

    await queryRunner.createIndex(
      "selfHostInstallations",
      new TableIndex({
        name: "IDX_self_host_installations_eventType",
        columnNames: ["eventType"],
      }),
    );

    await queryRunner.createIndex(
      "selfHostInstallations",
      new TableIndex({
        name: "IDX_self_host_installations_createdAt",
        columnNames: ["createdAt"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "selfHostInstallations",
      "IDX_self_host_installations_createdAt",
    );
    await queryRunner.dropIndex(
      "selfHostInstallations",
      "IDX_self_host_installations_eventType",
    );
    await queryRunner.dropIndex(
      "selfHostInstallations",
      "IDX_self_host_installations_installationId",
    );

    await queryRunner.dropTable("selfHostInstallations");
  }
}
