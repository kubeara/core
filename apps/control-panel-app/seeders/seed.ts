import * as fs from "fs";
import * as path from "path";
import dataSource from "../config/typeorm.config";

interface SeedTemplate {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  documentation: string;
  logo: string;
  compose: string;
  port: number;
  version: string;
  env_schema?: unknown;
  port_schema?: unknown;
  is_active: boolean;
}

async function run() {
  const ds = dataSource;

  if (!ds.isInitialized) {
    await ds.initialize();
  }

  const queryRunner = ds.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    const generatedTemplatesDir = path.join(
      process.cwd(),
      "apps",
      "control-panel-app",
      "generated-templates",
    );

    const files = fs
      .readdirSync(generatedTemplatesDir)
      .filter((file) => file.endsWith(".json"));

    for (const file of files) {
      const filePath = path.join(generatedTemplatesDir, file);

      const template = JSON.parse(
        fs.readFileSync(filePath, "utf8"),
      ) as SeedTemplate;

      await queryRunner.query(
        `
                INSERT INTO "serviceTemplates"
                (
                    slug,
                    name,
                    description,
                    category,
                    tags,
                    documentation,
                    logo,
                    compose,
                    port,
                    version,
                    env_schema,
                    port_schema,
                    is_active,
                    "createdAt",
                    "updatedAt"
                )
                VALUES
                (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13,
                    EXTRACT(EPOCH FROM NOW()) * 1000,
                    EXTRACT(EPOCH FROM NOW()) * 1000
                )
                ON CONFLICT (slug)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    category = EXCLUDED.category,
                    tags = EXCLUDED.tags,
                    documentation = EXCLUDED.documentation,
                    logo = EXCLUDED.logo,
                    compose = EXCLUDED.compose,
                    port = EXCLUDED.port,
                    version = EXCLUDED.version,
                    env_schema = EXCLUDED.env_schema,
                    port_schema = EXCLUDED.port_schema,
                    is_active = EXCLUDED.is_active,
                    "updatedAt" = EXTRACT(EPOCH FROM NOW()) * 1000
                `,
        [
          template.slug,
          template.name,
          template.description,
          template.category,
          template.tags,
          template.documentation,
          template.logo,
          template.compose,
          template.port,
          template.version,
          template.env_schema ?? null,
          template.port_schema ?? null,
          template.is_active,
        ],
      );

      console.log(`Seeded template: ${template.slug}`);
    }

    await queryRunner.commitTransaction();
    console.log("Seeding finished successfully");
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("Seeder failed:", error);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await ds.destroy();
  }
}

void run();
