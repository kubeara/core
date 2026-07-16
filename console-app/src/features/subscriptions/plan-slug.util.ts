import type { BillingCycleSlug, PlanTierSlug } from "./types";

export function getPlanTierSlug(slug: string): PlanTierSlug {
  if (slug === "free" || slug === "enterprise") {
    return slug;
  }

  const [tier] = slug.split("-");
  if (tier === "starter" || tier === "pro" || tier === "max") {
    return tier;
  }

  return slug as PlanTierSlug;
}

export function isPaidPlanSlug(slug: string): boolean {
  return /^(starter|pro|max)-(monthly|quarterly|yearly)$/.test(slug);
}

export const PLAN_TIER_ORDER: PlanTierSlug[] = [
  "free",
  "starter",
  "pro",
  "max",
  "enterprise",
];

export const BILLING_CYCLE_ORDER: BillingCycleSlug[] = [
  "monthly",
  "quarterly",
  "yearly",
];

export function getPlanBillingCycleFromSlug(slug: string): BillingCycleSlug {
  if (slug.endsWith("-quarterly")) return "quarterly";
  if (slug.endsWith("-yearly")) return "yearly";
  return "monthly";
}

export function compareBillingCycles(left: string, right: string): number {
  return (
    BILLING_CYCLE_ORDER.indexOf(getPlanBillingCycleFromSlug(left)) -
    BILLING_CYCLE_ORDER.indexOf(getPlanBillingCycleFromSlug(right))
  );
}
