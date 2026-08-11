import { PlanSlug } from "../src/modules/subscriptions/enums/plan-slug.enum";
import { BillingCycleSlug } from "../src/modules/subscriptions/enums/billing-cycle.enum";

export const PLAN_DEFINITIONS: Array<{
  slug: PlanSlug;
  tierSlug: string;
  billingCycle: BillingCycleSlug;
  price: number;
  listPrice: number | null;
  stripePriceId: string | null;
  sortOrder: number;
}> = [
  {
    slug: PlanSlug.FREE,
    tierSlug: "free",
    billingCycle: BillingCycleSlug.MONTHLY,
    price: 0,
    listPrice: 0,
    stripePriceId: "price_1TjvBKDwyDm0QIBwMvOA1RnY",
    sortOrder: 0,
  },
  {
    slug: PlanSlug.STARTER_MONTHLY,
    tierSlug: "starter",
    billingCycle: BillingCycleSlug.MONTHLY,
    price: 5,
    listPrice: 5,
    stripePriceId: "price_1TjvCMDwyDm0QIBwaaphIOtV",
    sortOrder: 1,
  },
  {
    slug: PlanSlug.STARTER_QUARTERLY,
    tierSlug: "starter",
    billingCycle: BillingCycleSlug.QUARTERLY,
    price: 13.5,
    listPrice: 15,
    stripePriceId: "price_1TnZtLDwyDm0QIBwQDSKj8TV",
    sortOrder: 1,
  },
  {
    slug: PlanSlug.STARTER_YEARLY,
    tierSlug: "starter",
    billingCycle: BillingCycleSlug.YEARLY,
    price: 30,
    listPrice: 60,
    stripePriceId: "price_1TnZtiDwyDm0QIBwkR4i2BRv",
    sortOrder: 1,
  },
  {
    slug: PlanSlug.PRO_MONTHLY,
    tierSlug: "pro",
    billingCycle: BillingCycleSlug.MONTHLY,
    price: 29,
    listPrice: 29,
    stripePriceId: "price_1TlkRnDwyDm0QIBwx5DVaQCF",
    sortOrder: 2,
  },
  {
    slug: PlanSlug.PRO_QUARTERLY,
    tierSlug: "pro",
    billingCycle: BillingCycleSlug.QUARTERLY,
    price: 78,
    listPrice: 87,
    stripePriceId: "price_1TnZoPDwyDm0QIBwX9oN0nrV",
    sortOrder: 2,
  },
  {
    slug: PlanSlug.PRO_YEARLY,
    tierSlug: "pro",
    billingCycle: BillingCycleSlug.YEARLY,
    price: 174,
    listPrice: 348,
    stripePriceId: "price_1TnZnwDwyDm0QIBwQqJobY3t",
    sortOrder: 2,
  },
  {
    slug: PlanSlug.MAX_MONTHLY,
    tierSlug: "max",
    billingCycle: BillingCycleSlug.MONTHLY,
    price: 99,
    listPrice: 99,
    stripePriceId: "price_1TlkT9DwyDm0QIBwfMRRNakN",
    sortOrder: 3,
  },
  {
    slug: PlanSlug.MAX_QUARTERLY,
    tierSlug: "max",
    billingCycle: BillingCycleSlug.QUARTERLY,
    price: 267,
    listPrice: 297,
    stripePriceId: "price_1TnZrhDwyDm0QIBwydE7ywWO",
    sortOrder: 3,
  },
  {
    slug: PlanSlug.MAX_YEARLY,
    tierSlug: "max",
    billingCycle: BillingCycleSlug.YEARLY,
    price: 582,
    listPrice: 1188,
    stripePriceId: "price_1TnZrGDwyDm0QIBwxBTehD9n",
    sortOrder: 3,
  },
  {
    slug: PlanSlug.ENTERPRISE,
    tierSlug: "enterprise",
    billingCycle: BillingCycleSlug.MONTHLY,
    price: 0,
    listPrice: 0,
    stripePriceId: null,
    sortOrder: 4,
  },
];
