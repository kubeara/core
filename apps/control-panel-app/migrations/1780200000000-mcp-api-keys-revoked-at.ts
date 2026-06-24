import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class McpApiKeysRevokedAt1780200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "mcpApiKeys",
      new TableColumn({
        name: "revokedAt",
        type: "bigint",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("mcpApiKeys", "revokedAt");
  }
}
