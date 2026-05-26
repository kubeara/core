import { MigrationInterface, QueryRunner, Table, TableUnique } from "typeorm";

export class Users1779272000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "users",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "organizationId",
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
            name: "email",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "passwordHash",
            type: "text",
            isNullable: false,
          },
          {
            name: "profilePictureUrl",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "dateOfBirth",
            type: "bigint",
            isNullable: true,
          },
          {
            name: "signUpAt",
            type: "bigint",
            isNullable: false,
          },
          {
            name: "lastLoginAt",
            type: "bigint",
            isNullable: true,
          },
          {
            name: "lastPasswordResetAt",
            type: "bigint",
            isNullable: true,
          },
          {
            name: "isEmailVerified",
            type: "boolean",
            default: false,
          },
          {
            name: "emailVerifiedAt",
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

    await queryRunner.createUniqueConstraint(
      "users",
      new TableUnique({
        name: "UQ_users_email",
        columnNames: ["email"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropUniqueConstraint("users", "UQ_users_email");

    await queryRunner.dropTable("users");
  }
}
