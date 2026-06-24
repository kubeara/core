import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import dayjs from "dayjs";

import { PlanEntity } from "../src/modules/subscriptions/entities/plan.entity";
import { PlanSlug } from "../src/modules/subscriptions/enums/plan-slug.enum";
import { PlanFeatures } from "../src/modules/subscriptions/interfaces/plan-features.interface";
import { DEFAULT_PLAN_FEATURES } from "../src/modules/subscriptions/utils/plan-features.util";
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
  features: PlanFeatures;
}> = [
  {
    slug: PlanSlug.FREE,
    name: "Free",
    description: "For individuals exploring Kubeara",
    priceMonthly: 0,
    stripePriceId: "price_1TjvBKDwyDm0QIBwMvOA1RnY",
    sortOrder: 0,
    features: DEFAULT_PLAN_FEATURES[PlanSlug.FREE],
  },
  {
    slug: PlanSlug.STARTER,
    name: "Starter",
    description: "For small teams getting production-ready",
    priceMonthly: 5,
    stripePriceId: "price_1TjvCMDwyDm0QIBwaaphIOtV",
    sortOrder: 1,
    features: DEFAULT_PLAN_FEATURES[PlanSlug.STARTER],
  },
  {
    slug: PlanSlug.PRO,
    name: "Pro",
    description: "For growing teams with collaboration needs",
    priceMonthly: 29,
    stripePriceId: "price_1TlkRnDwyDm0QIBwx5DVaQCF",
    sortOrder: 2,
    features: DEFAULT_PLAN_FEATURES[PlanSlug.PRO],
  },
  {
    slug: PlanSlug.MAX,
    name: "Max",
    description: "For advanced teams running at scale",
    priceMonthly: 99,
    stripePriceId: "price_1TlkT9DwyDm0QIBwfMRRNakN",
    sortOrder: 3,
    features: DEFAULT_PLAN_FEATURES[PlanSlug.MAX],
  },
  {
    slug: PlanSlug.ENTERPRISE,
    name: "Enterprise",
    description: "For compliance-heavy organizations",
    priceMonthly: 0,
    stripePriceId: null,
    sortOrder: 4,
    features: DEFAULT_PLAN_FEATURES[PlanSlug.ENTERPRISE],
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

  const legacyBusiness = await planRepository.findOne({
    where: { slug: "business" as PlanSlug },
  });
  if (legacyBusiness) {
    legacyBusiness.status = EntityStatus.INACTIVE;
    legacyBusiness.updatedAt = now;
    await planRepository.save(legacyBusiness);
  }

  console.log(`Seeded ${PLAN_DEFINITIONS.length} subscription plans`);

  await ds.destroy();
}
