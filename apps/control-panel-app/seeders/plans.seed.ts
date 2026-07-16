import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import dayjs from "dayjs";

import { PlanEntity } from "../src/modules/subscriptions/entities/plan.entity";
import { PlanSlug } from "../src/modules/subscriptions/enums/plan-slug.enum";
import { EntityStatus } from "../src/common/entity/base.entity";
import { PLAN_DEFINITIONS } from "./plan-definitions.defaults";

const ROOT_DIR = process.cwd();
const APP_ENV_PATH = path.join(ROOT_DIR, "apps/control-panel-app/.env");

function loadEnv(): ConfigService {
  if (fs.existsSync(APP_ENV_PATH)) {
    dotenv.config({ path: APP_ENV_PATH });
  }
  return new ConfigService();
}

const LEGACY_SLUGS = ["starter", "pro", "max", "business"] as const;

export async function seedPlans(): Promise<void> {
  const configService = loadEnv();
  const ds = new DataSource({
    type: "postgres",
    host: configService.get<string>("DB_HOST"),
    port: Number(configService.get<string>("DB_PORT")),
    username: configService.get<string>("DB_USERNAME"),
    password: configService.get<string>("DB_PASSWORD"),
    database: configService.get<string>("DB_DATABASE"),
    entities: [PlanEntity],
    synchronize: false,
  });

  if (!ds.isInitialized) {
    await ds.initialize();
  }

  const planRepository = ds.getRepository(PlanEntity);
  const now = dayjs().unix();

  for (const def of PLAN_DEFINITIONS) {
    const existing = await planRepository.findOne({
      where: { slug: def.slug },
    });

    if (existing) {
      existing.name = def.name;
      existing.description = def.description;
      existing.tierSlug = def.tierSlug;
      existing.billingCycle = def.billingCycle;
      existing.price = def.price;
      existing.listPrice = def.listPrice;
      existing.stripePriceId = def.stripePriceId;
      existing.features = def.features;
      existing.sortOrder = def.sortOrder;
      existing.status = EntityStatus.ACTIVE;
      existing.updatedAt = now;
      await planRepository.save(existing);
    } else {
      const plan = planRepository.create({
        slug: def.slug,
        tierSlug: def.tierSlug,
        billingCycle: def.billingCycle,
        name: def.name,
        description: def.description,
        price: def.price,
        listPrice: def.listPrice,
        stripePriceId: def.stripePriceId,
        features: def.features,
        sortOrder: def.sortOrder,
        status: EntityStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
      });
      await planRepository.save(plan);
    }
  }

  for (const legacySlug of LEGACY_SLUGS) {
    const legacy = await planRepository.findOne({
      where: { slug: legacySlug as PlanSlug },
    });
    if (legacy) {
      legacy.status = EntityStatus.INACTIVE;
      legacy.updatedAt = now;
      await planRepository.save(legacy);
    }
  }

  console.log(`Seeded ${PLAN_DEFINITIONS.length} subscription plans`);

  await ds.destroy();
}
