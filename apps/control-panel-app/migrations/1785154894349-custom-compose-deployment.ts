import dayjs from "dayjs";
import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from "typeorm";

const CUSTOM_TEMPLATE_SLUG = "custom";
const CUSTOM_TEMPLATE_COMPOSE =
  "eyJzZXJ2aWNlcyI6eyJwbGFjZWhvbGRlciI6eyJpbWFnZSI6ImFscGluZTozLjE5IiwiY29tbWFuZCI6WyJ0cnVlIl0sInJlc3RhcnQiOiJ1bmxlc3Mtc3RvcHBlZCJ9fX0=";

export class CustomComposeDeployment1785154894349 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.seedCustomTemplate(queryRunner);

    await queryRunner.addColumns("serviceDeployments", [
      new TableColumn({
        name: "serviceTemplateId",
        type: "uuid",
        isNullable: true,
      }),
      new TableColumn({
        name: "displayName",
        type: "varchar",
        length: "255",
        isNullable: true,
      }),
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

    await queryRunner.createIndex(
      "serviceDeployments",
      new TableIndex({
        name: "IDX_service_deployments_serviceTemplateId",
        columnNames: ["serviceTemplateId"],
      }),
    );

    await queryRunner.createForeignKey(
      "serviceDeployments",
      new TableForeignKey({
        name: "FK_service_deployments_serviceTemplateId",
        columnNames: ["serviceTemplateId"],
        referencedTableName: "serviceTemplates",
        referencedColumnNames: ["id"],
        onDelete: "SET NULL",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(
      "serviceDeployments",
      "FK_service_deployments_serviceTemplateId",
    );

    await queryRunner.dropIndex(
      "serviceDeployments",
      "IDX_service_deployments_serviceTemplateId",
    );

    await queryRunner.dropColumns("serviceDeployments", [
      "encryptedComposeContent",
      "deploymentType",
      "displayName",
      "serviceTemplateId",
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

  private async seedCustomTemplate(queryRunner: QueryRunner): Promise<void> {
    const existingCustomTemplate = await queryRunner.manager
      .createQueryBuilder()
      .select("template.slug", "slug")
      .from("serviceTemplates", "template")
      .where("template.slug = :slug", { slug: CUSTOM_TEMPLATE_SLUG })
      .getRawOne<{ slug: string }>();

    if (existingCustomTemplate) {
      return;
    }

    const now = dayjs().unix();

    await queryRunner.manager.insert("serviceTemplates", {
      slug: CUSTOM_TEMPLATE_SLUG,
      name: "Custom",
      shortDescription: "User-uploaded Docker Compose stack",
      category: ["custom"],
      tags: ["custom", "compose"],
      compose: CUSTOM_TEMPLATE_COMPOSE,
      isActive: true,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
  }
}
