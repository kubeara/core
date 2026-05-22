import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class ServerSshCredentials1779273149484 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "serverSshCredentials",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "serverId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "authType",
            type: "enum",
            enumName: "serverSshAuthTypeEnum",
            enum: ["PASSWORD", "PRIVATE_KEY"],
            isNullable: false,
          },
          {
            name: "encryptedPrivateKey",
            type: "text",
            isNullable: true,
          },
          {
            name: "privateKeyPassphrase",
            type: "text",
            isNullable: true,
          },
          {
            name: "encryptedPassword",
            type: "text",
            isNullable: true,
          },
          {
            name: "sshFingerprint",
            type: "varchar",
            length: "255",
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
      "serverSshCredentials",
      new TableIndex({
        name: "IDX_serverSshCredentials_serverId",
        columnNames: ["serverId"],
      }),
    );

    await queryRunner.createIndex(
      "serverSshCredentials",
      new TableIndex({
        name: "IDX_serverSshCredentials_authType",
        columnNames: ["authType"],
      }),
    );

    await queryRunner.createForeignKey(
      "serverSshCredentials",
      new TableForeignKey({
        columnNames: ["serverId"],
        referencedColumnNames: ["id"],
        referencedTableName: "servers",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("serverSshCredentials");

    if (table) {
      const foreignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf("serverId") !== -1,
      );

      if (foreignKey) {
        await queryRunner.dropForeignKey("serverSshCredentials", foreignKey);
      }
    }

    await queryRunner.dropIndex(
      "serverSshCredentials",
      "IDX_serverSshCredentials_authType",
    );

    await queryRunner.dropIndex(
      "serverSshCredentials",
      "IDX_serverSshCredentials_serverId",
    );

    await queryRunner.dropTable("serverSshCredentials");

    await queryRunner.query(`
            DROP TYPE "serverSshAuthTypeEnum"
        `);
  }
}
