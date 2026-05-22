import dataSource from "../config/typeorm.config";

import { seedTemplates } from "./templates.seed";
// import { seedUsers } from "./users.seed";
// import { seedRoles } from "./roles.seed";

async function run() {
  const ds = dataSource;

  if (!ds.isInitialized) {
    await ds.initialize();
  }

  const queryRunner = ds.createQueryRunner();

  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    console.log("Starting database seeding...");

    await seedTemplates(queryRunner);

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