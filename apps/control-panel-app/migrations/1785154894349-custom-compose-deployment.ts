import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from "typeorm";

export class CustomComposeDeployment1785154894349 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns("serviceDeployments", [
      new TableColumn({
        name: "deploymentType",
        type: "varchar",
        length: "32",
        default: "'PLATFORM_SERVICE'",
        isNullable: false,
      }),

      new TableColumn({
        name: "encryptedComposeContent",
        type: "text",
        isNullable: true,
      }),
    ]);

    await queryRunner.dropForeignKey(
      "serviceDeployments",
      "FK_service_deployments_templateSlug",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns("serviceDeployments", [
      "encryptedComposeContent",
      "deploymentType",
    ]);

    await queryRunner.createForeignKey(
      "serviceDeployments",
      new TableForeignKey({
        name: "FK_service_deployments_templateSlug",
        columnNames: ["templateSlug"],
        referencedColumnNames: ["slug"],
        referencedTableName: "serviceTemplates",
      }),
    );
  }
}
