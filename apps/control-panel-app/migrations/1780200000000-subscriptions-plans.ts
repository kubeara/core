import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class SubscriptionsPlans1780200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "plans",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "slug",
            type: "varchar",
            length: "50",
            isUnique: true,
            isNullable: false,
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
            isNullable: false,
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "priceMonthly",
            type: "int",
            default: 0,
            isNullable: false,
          },
          {
            name: "stripePriceId",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "features",
            type: "jsonb",
            default: "'[]'",
            isNullable: false,
          },
          {
            name: "sortOrder",
            type: "int",
            default: 0,
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

    await queryRunner.createTable(
      new Table({
        name: "subscriptions",
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
            name: "planId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "stripeCustomerId",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "stripeSubscriptionId",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "subscriptionStatus",
            type: "varchar",
            length: "50",
            default: "'active'",
            isNullable: false,
          },
          {
            name: "startedAt",
            type: "bigint",
            isNullable: false,
          },
          {
            name: "currentPeriodStart",
            type: "bigint",
            isNullable: true,
          },
          {
            name: "currentPeriodEnd",
            type: "bigint",
            isNullable: true,
          },
          {
            name: "canceledAt",
            type: "bigint",
            isNullable: true,
          },
          {
            name: "billingAmount",
            type: "int",
            default: 0,
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
      "subscriptions",
      new TableIndex({
        name: "IDX_subscriptions_organizationId",
        columnNames: ["organizationId"],
      }),
    );

    await queryRunner.createForeignKey(
      "subscriptions",
      new TableForeignKey({
        columnNames: ["organizationId"],
        referencedTableName: "organizations",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createForeignKey(
      "subscriptions",
      new TableForeignKey({
        columnNames: ["planId"],
        referencedTableName: "plans",
        referencedColumnNames: ["id"],
        onDelete: "RESTRICT",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("subscriptions");
    await queryRunner.dropTable("plans");
  }
}
