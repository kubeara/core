import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from "typeorm";

export class Server1779272785745 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "servers",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "userId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "name",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "host",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "port",
            type: "integer",
            default: 22,
            isNullable: false,
          },
          {
            name: "username",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "provider",
            type: "enum",
            enumName: "serverProviderEnum",
            enum: [
              "CUSTOM",
              "AWS",
              "AZURE",
              "GCP",
              "DIGITAL_OCEAN",
              "HETZNER",
              "LINODE",
              "ON_PREMISE",
            ],
            default: "'CUSTOM'",
            isNullable: false,
          },
          {
            name: "region",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "operatingSystem",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "serverType",
            type: "enum",
            enumName: "serverTypeEnum",
            enum: ["VIRTUAL_MACHINE", "CONTAINER", "BARE_METAL"],
            default: "'VIRTUAL_MACHINE'",
            isNullable: false,
          },
          {
            name: "status",
            type: "varchar",
            length: "50",
            default: "'ACTIVE'",
            isNullable: false,
          },
          {
            name: "lastConnectedAt",
            type: "bigint",
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
      true,
    );

    await queryRunner.createIndex(
      "servers",
      new TableIndex({
        name: "IDX_servers_host",
        columnNames: ["host"],
      }),
    );

    await queryRunner.createIndex(
      "servers",
      new TableIndex({
        name: "IDX_servers_status",
        columnNames: ["status"],
      }),
    );

    await queryRunner.createUniqueConstraint(
      "servers",
      new TableUnique({
        name: "servers_host_username_unique",
        columnNames: ["host", "username"],
      }),
    );

    await queryRunner.createForeignKey(
      "servers",
      new TableForeignKey({
        name: "FK_servers_userId",
        columnNames: ["userId"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("servers", "IDX_servers_status");

    await queryRunner.dropIndex("servers", "IDX_servers_host");

    await queryRunner.dropUniqueConstraint(
      "servers",
      "servers_host_username_unique",
    );

    await queryRunner.dropForeignKey("servers", "FK_servers_userId");

    await queryRunner.dropTable("servers");

    await queryRunner.query(`
            DROP TYPE "serverTypeEnum"
        `);

    await queryRunner.query(`
            DROP TYPE "serverProviderEnum"
        `);
  }
}
