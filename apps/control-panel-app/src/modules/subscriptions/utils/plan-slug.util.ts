import { BillingCycleSlug } from "../enums/billing-cycle.enum";
import { PlanTierSlug } from "../enums/plan-slug.enum";

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

export function getPlanBillingCycleFromSlug(slug: string): BillingCycleSlug {
  if (slug.endsWith("-quarterly")) {
    return BillingCycleSlug.QUARTERLY;
  }
  if (slug.endsWith("-yearly")) {
    return BillingCycleSlug.YEARLY;
  }
  return BillingCycleSlug.MONTHLY;
}

export function composePlanSlug(
  tier: PlanTierSlug,
  cycle: BillingCycleSlug,
): string {
  if (tier === "free" || tier === "enterprise") {
    return tier;
  }
  return `${tier}-${cycle}`;
}

export function resolveCheckoutPlanSlug(
  planSlug: string,
  billingCycle?: BillingCycleSlug,
): string {
  if (
    planSlug === "free" ||
    planSlug === "enterprise" ||
    planSlug.endsWith("-monthly") ||
    planSlug.endsWith("-quarterly") ||
    planSlug.endsWith("-yearly")
  ) {
    return planSlug;
  }

  if (!billingCycle) {
    return planSlug;
  }

  return composePlanSlug(planSlug as PlanTierSlug, billingCycle);
}

export function comparePlanTiers(left: string, right: string): number {
  const order = ["free", "starter", "pro", "max", "enterprise"];
  return (
    order.indexOf(getPlanTierSlug(left)) - order.indexOf(getPlanTierSlug(right))
  );
}
