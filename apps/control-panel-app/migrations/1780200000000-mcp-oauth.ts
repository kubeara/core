import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class McpOauthInit1780200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "mcpOauthAuthorizationCodes",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "codeHash",
            type: "text",
            isNullable: false,
          },
          {
            name: "userId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "codeChallenge",
            type: "text",
            isNullable: false,
          },
          {
            name: "codeChallengeMethod",
            type: "varchar",
            length: "16",
            isNullable: false,
          },
          {
            name: "redirectUri",
            type: "text",
            isNullable: false,
          },
          {
            name: "clientId",
            type: "text",
            isNullable: false,
          },
          {
            name: "resource",
            type: "text",
            isNullable: false,
          },
          {
            name: "scopes",
            type: "text",
            isNullable: false,
          },
          {
            name: "expiresAt",
            type: "bigint",
            isNullable: false,
          },
          {
            name: "usedAt",
            type: "bigint",
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

    await queryRunner.createTable(
      new Table({
        name: "mcpOauthRefreshTokens",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "tokenHash",
            type: "text",
            isNullable: false,
          },
          {
            name: "userId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "clientId",
            type: "text",
            isNullable: false,
          },
          {
            name: "resource",
            type: "text",
            isNullable: false,
          },
          {
            name: "scopes",
            type: "text",
            isNullable: false,
          },
          {
            name: "expiresAt",
            type: "bigint",
            isNullable: false,
          },
          {
            name: "revokedAt",
            type: "bigint",
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

    await queryRunner.createForeignKey(
      "mcpOauthAuthorizationCodes",
      new TableForeignKey({
        name: "FK_mcp_oauth_codes_userId",
        columnNames: ["userId"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
    );

    await queryRunner.createForeignKey(
      "mcpOauthRefreshTokens",
      new TableForeignKey({
        name: "FK_mcp_oauth_refresh_userId",
        columnNames: ["userId"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
    );

    await queryRunner.createIndex(
      "mcpOauthAuthorizationCodes",
      new TableIndex({
        name: "IDX_mcp_oauth_codes_codeHash",
        columnNames: ["codeHash"],
      }),
    );

    await queryRunner.createIndex(
      "mcpOauthRefreshTokens",
      new TableIndex({
        name: "IDX_mcp_oauth_refresh_tokenHash",
        columnNames: ["tokenHash"],
      }),
    );

    await queryRunner.createIndex(
      "mcpOauthRefreshTokens",
      new TableIndex({
        name: "IDX_mcp_oauth_refresh_userId",
        columnNames: ["userId"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "mcpOauthRefreshTokens",
      "IDX_mcp_oauth_refresh_userId",
    );
    await queryRunner.dropIndex(
      "mcpOauthRefreshTokens",
      "IDX_mcp_oauth_refresh_tokenHash",
    );
    await queryRunner.dropIndex(
      "mcpOauthAuthorizationCodes",
      "IDX_mcp_oauth_codes_codeHash",
    );
    await queryRunner.dropForeignKey(
      "mcpOauthRefreshTokens",
      "FK_mcp_oauth_refresh_userId",
    );
    await queryRunner.dropForeignKey(
      "mcpOauthAuthorizationCodes",
      "FK_mcp_oauth_codes_userId",
    );
    await queryRunner.dropTable("mcpOauthRefreshTokens");
    await queryRunner.dropTable("mcpOauthAuthorizationCodes");
  }
}
