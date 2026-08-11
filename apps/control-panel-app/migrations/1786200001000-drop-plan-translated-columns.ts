import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class DropPlanTranslatedColumns1786200001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns("plans", ["name", "description", "features"]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("plans");

    if (!table?.findColumnByName("name")) {
      await queryRunner.addColumn(
        "plans",
        new TableColumn({
          name: "name",
          type: "varchar",
          length: "100",
          isNullable: true,
        }),
      );
    }

    if (!table?.findColumnByName("description")) {
      await queryRunner.addColumn(
        "plans",
        new TableColumn({
          name: "description",
          type: "text",
          isNullable: true,
        }),
      );
    }

    if (!table?.findColumnByName("features")) {
      await queryRunner.addColumn(
        "plans",
        new TableColumn({ name: "features", type: "jsonb", isNullable: true }),
      );
    }
  }
}
