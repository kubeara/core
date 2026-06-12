import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class McpApiKeysInit1780100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "mcpApiKeys",
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
            name: "keyHash",
            type: "text",
            isNullable: false,
          },
          {
            name: "name",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "lastUsedAt",
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
      "mcpApiKeys",
      new TableForeignKey({
        name: "FK_mcp_api_keys_userId",
        columnNames: ["userId"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
    );

    await queryRunner.createIndex(
      "mcpApiKeys",
      new TableIndex({
        name: "IDX_mcp_api_keys_userId",
        columnNames: ["userId"],
      }),
    );

    await queryRunner.createIndex(
      "mcpApiKeys",
      new TableIndex({
        name: "IDX_mcp_api_keys_keyHash",
        columnNames: ["keyHash"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("mcpApiKeys", "IDX_mcp_api_keys_keyHash");
    await queryRunner.dropIndex("mcpApiKeys", "IDX_mcp_api_keys_userId");
    await queryRunner.dropForeignKey("mcpApiKeys", "FK_mcp_api_keys_userId");
    await queryRunner.dropTable("mcpApiKeys");
  }
}
