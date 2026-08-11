import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from "typeorm";

export class DropServiceTemplatesTranslatedColumns1786087683000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("serviceTemplates");

    const categoryIndex = table?.indices.find(
      (index) => index.name === "IDX_serviceTemplates_category",
    );

    if (categoryIndex) {
      await queryRunner.dropIndex("serviceTemplates", categoryIndex);
    }

    await queryRunner.dropColumns("serviceTemplates", [
      "shortDescription",
      "longDescription",
      "category",
      "tags",
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns("serviceTemplates", [
      new TableColumn({
        name: "shortDescription",
        type: "text",
        isNullable: true,
      }),
      new TableColumn({
        name: "longDescription",
        type: "text",
        isNullable: true,
      }),
      new TableColumn({
        name: "category",
        type: "text",
        isArray: true,
        isNullable: true,
      }),
      new TableColumn({
        name: "tags",
        type: "text",
        isArray: true,
        isNullable: true,
      }),
    ]);

    await queryRunner.createIndex(
      "serviceTemplates",
      new TableIndex({
        name: "IDX_serviceTemplates_category",
        columnNames: ["category"],
        type: "gin",
      }),
    );
  }
}
