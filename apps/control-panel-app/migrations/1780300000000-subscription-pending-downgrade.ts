import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from "typeorm";

export class SubscriptionPendingDowngrade1780300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns("subscriptions", [
      new TableColumn({
        name: "pendingPlanId",
        type: "uuid",
        isNullable: true,
      }),
      new TableColumn({
        name: "pendingEffectiveAt",
        type: "bigint",
        isNullable: true,
      }),
      new TableColumn({
        name: "pendingDowngradeStatus",
        type: "varchar",
        length: "50",
        isNullable: true,
      }),
    ]);

    await queryRunner.createForeignKey(
      "subscriptions",
      new TableForeignKey({
        columnNames: ["pendingPlanId"],
        referencedTableName: "plans",
        referencedColumnNames: ["id"],
        onDelete: "SET NULL",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("subscriptions");
    const foreignKey = table?.foreignKeys.find((key) =>
      key.columnNames.includes("pendingPlanId"),
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey("subscriptions", foreignKey);
    }

    await queryRunner.dropColumns("subscriptions", [
      "pendingPlanId",
      "pendingEffectiveAt",
      "pendingDowngradeStatus",
    ]);
  }
}
