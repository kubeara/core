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

const ROOT_DIR = process.cwd();
const APP_ENV_PATH = path.join(ROOT_DIR, "apps/control-panel-app/.env");

function loadEnv(): ConfigService {
  if (fs.existsSync(APP_ENV_PATH)) {
    dotenv.config({ path: APP_ENV_PATH });
  }
  return new ConfigService();
}

const PLAN_DEFINITIONS: Array<{
  slug: PlanSlug;
  name: string;
  description: string;
  priceMonthly: number;
  stripePriceId: string | null;
  sortOrder: number;
  features: string[];
}> = [
  {
    slug: PlanSlug.FREE,
    name: "Free",
    description: "Get started with essential features",
    priceMonthly: 0,
    stripePriceId: "price_1TjvBKDwyDm0QIBwMvOA1RnY",
    sortOrder: 0,
    features: [
      "1 server connection",
      "Basic templates",
      "Community support",
    ],
  },
  {
    slug: PlanSlug.STARTER,
    name: "Starter",
    description: "For individuals getting serious",
    priceMonthly: 5,
    stripePriceId: "price_1TjvCMDwyDm0QIBwaaphIOtV",
    sortOrder: 1,
    features: [
      "3 server connections",
      "All templates",
      "Email support",
      "Deployment logs",
    ],
  },
  {
    slug: PlanSlug.PRO,
    name: "Pro",
    description: "For power users and small teams",
    priceMonthly: 10,
    stripePriceId: "price_1TjvClDwyDm0QIBwCf8O0xY1",
    sortOrder: 2,
    features: [
      "10 server connections",
      "All templates",
      "Priority support",
      "MCP server access",
      "Advanced deployment options",
    ],
  },
  {
    slug: PlanSlug.BUSINESS,
    name: "Business",
    description: "For teams with advanced needs",
    priceMonthly: 15,
    stripePriceId: "price_1TjvCyDwyDm0QIBwmt0S9AAg",
    sortOrder: 3,
    features: [
      "Unlimited server connections",
      "All templates",
      "Dedicated support",
      "MCP server access",
      "Team management",
      "Custom integrations",
    ],
  },
];

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
      existing.priceMonthly = def.priceMonthly;
      existing.stripePriceId = def.stripePriceId;
      existing.features = def.features;
      existing.sortOrder = def.sortOrder;
      existing.status = EntityStatus.ACTIVE;
      existing.updatedAt = now;
      await planRepository.save(existing);
    } else {
      const plan = planRepository.create({
        slug: def.slug,
        name: def.name,
        description: def.description,
        priceMonthly: def.priceMonthly,
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

  console.log(`Seeded ${PLAN_DEFINITIONS.length} subscription plans`);

  await ds.destroy();
}
