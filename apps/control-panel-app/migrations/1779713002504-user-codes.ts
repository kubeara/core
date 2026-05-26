import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class UserCodes1779713002504 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "userCodes",
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
            name: "codeType",
            type: "enum",
            enumName: "verificationTypeEnum",
            enum: ["EMAIL_VERIFICATION", "FORGOT_PASSWORD", "LOGIN_OTP"],
            isNullable: false,
          },
          {
            name: "otpHash",
            type: "text",
            isNullable: false,
          },
          {
            name: "expiresAt",
            type: "bigint",
            isNullable: false,
          },
          {
            name: "attempts",
            type: "integer",
            default: 0,
            isNullable: false,
          },
          {
            name: "verifiedAt",
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
      "userCodes",
      new TableForeignKey({
        columnNames: ["userId"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
        name: "FK_user_codes_userId",
      }),
    );

    await queryRunner.createIndex(
      "userCodes",
      new TableIndex({
        name: "IDX_user_codes_userId",
        columnNames: ["userId"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("userCodes", "IDX_user_codes_userId");

    await queryRunner.dropForeignKey("userCodes", "FK_user_codes_userId");

    await queryRunner.dropTable("userCodes");
  }
}
