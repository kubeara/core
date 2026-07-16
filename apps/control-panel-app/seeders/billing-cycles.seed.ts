import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import dayjs from "dayjs";

import { BillingCycleEntity } from "../src/modules/subscriptions/entities/billing-cycle.entity";
import { BillingCycleSlug } from "../src/modules/subscriptions/enums/billing-cycle.enum";
import { EntityStatus } from "../src/common/entity/base.entity";

const ROOT_DIR = process.cwd();
const APP_ENV_PATH = path.join(ROOT_DIR, "apps/control-panel-app/.env");

export const BILLING_CYCLE_DEFINITIONS: Array<{
  slug: BillingCycleSlug;
  label: string;
  badge: string | null;
  discountPercent: number;
  sortOrder: number;
}> = [
  {
    slug: BillingCycleSlug.MONTHLY,
    label: "Monthly",
    badge: null,
    discountPercent: 0,
    sortOrder: 0,
  },
  {
    slug: BillingCycleSlug.QUARTERLY,
    label: "Quarterly",
    badge: null,
    discountPercent: 10,
    sortOrder: 1,
  },
  {
    slug: BillingCycleSlug.YEARLY,
    label: "Yearly",
    badge: "Save 50%",
    discountPercent: 50,
    sortOrder: 2,
  },
];

function loadEnv(): ConfigService {
  if (fs.existsSync(APP_ENV_PATH)) {
    dotenv.config({ path: APP_ENV_PATH });
  }
  return new ConfigService();
}

export async function seedBillingCycles(): Promise<void> {
  const configService = loadEnv();
  const ds = new DataSource({
    type: "postgres",
    host: configService.get<string>("DB_HOST"),
    port: Number(configService.get<string>("DB_PORT")),
    username: configService.get<string>("DB_USERNAME"),
    password: configService.get<string>("DB_PASSWORD"),
    database: configService.get<string>("DB_DATABASE"),
    entities: [BillingCycleEntity],
    synchronize: false,
  });

  if (!ds.isInitialized) {
    await ds.initialize();
  }

  const billingCycleRepository = ds.getRepository(BillingCycleEntity);
  const now = dayjs().unix();

  for (const def of BILLING_CYCLE_DEFINITIONS) {
    const existing = await billingCycleRepository.findOne({
      where: { slug: def.slug },
    });

    if (existing) {
      existing.label = def.label;
      existing.badge = def.badge;
      existing.discountPercent = def.discountPercent;
      existing.sortOrder = def.sortOrder;
      existing.status = EntityStatus.ACTIVE;
      existing.updatedAt = now;
      await billingCycleRepository.save(existing);
    } else {
      const cycle = billingCycleRepository.create({
        slug: def.slug,
        label: def.label,
        badge: def.badge,
        discountPercent: def.discountPercent,
        sortOrder: def.sortOrder,
        status: EntityStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
      });
      await billingCycleRepository.save(cycle);
    }
  }

  console.log(`Seeded ${BILLING_CYCLE_DEFINITIONS.length} billing cycles`);

  await ds.destroy();
}
