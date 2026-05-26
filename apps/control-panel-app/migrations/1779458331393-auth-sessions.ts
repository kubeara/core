import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AuthSessions1779458331393 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "authSessions",
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
            name: "tokenType",
            type: "varchar",
            isNullable: false,
            default: "'jwt'",
          },
          {
            name: "accessToken",
            type: "text",
            isNullable: false,
          },
          {
            name: "refreshToken",
            type: "text",
            isNullable: false,
          },
          {
            name: "ipAddress",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "userAgent",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "expiresAt",
            type: "bigint",
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
      "authSessions",
      new TableIndex({
        name: "IDX_auth_sessions_userId",
        columnNames: ["userId"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("authSessions", "IDX_auth_sessions_userId");

    await queryRunner.dropTable("authSessions");
  }
}
