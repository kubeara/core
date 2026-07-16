import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from "typeorm";

export class ActivitiesInit1783939830340 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "activities",
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
            name: "serverId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "type",
            type: "varchar",
            length: "64",
            isNullable: false,
          },
          {
            name: "title",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "message",
            type: "text",
            isNullable: true,
          },
          {
            name: "operationStatus",
            type: "varchar",
            length: "32",
            default: "'pending'",
            isNullable: false,
          },
          {
            name: "deploymentId",
            type: "varchar",
            length: "128",
            isNullable: true,
          },
          {
            name: "templateSlug",
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

    await queryRunner.createForeignKey(
      "activities",
      new TableForeignKey({
        name: "FK_activities_userId",
        columnNames: ["userId"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
    );

    await queryRunner.createForeignKey(
      "activities",
      new TableForeignKey({
        name: "FK_activities_serverId",
        columnNames: ["serverId"],
        referencedTableName: "servers",
        referencedColumnNames: ["id"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("activities", "IDX_activities_userId");
    await queryRunner.dropForeignKey("activities", "FK_activities_serverId");
    await queryRunner.dropTable("activities");
  }
}
