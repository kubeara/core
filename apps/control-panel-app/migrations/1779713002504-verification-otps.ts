import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class VerificationOtps1779713002504 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "verificationOtps",
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
            name: "type",
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
      "verificationOtps",
      new TableForeignKey({
        columnNames: ["userId"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
        name: "FK_verification_otps_user",
      }),
    );

    await queryRunner.createIndex(
      "verificationOtps",
      new TableIndex({
        name: "IDX_verification_otps_userId",
        columnNames: ["userId"],
      }),
    );

    await queryRunner.createIndex(
      "verificationOtps",
      new TableIndex({
        name: "IDX_verification_otps_type",
        columnNames: ["type"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "verificationOtps",
      "IDX_verification_otps_type",
    );

    await queryRunner.dropIndex(
      "verificationOtps",
      "IDX_verification_otps_userId",
    );

    await queryRunner.dropForeignKey(
      "verificationOtps",
      "FK_verification_otps_user",
    );

    await queryRunner.dropTable("verificationOtps");
  }
}
