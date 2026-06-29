import type { PlanTierSlug } from "./types";

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
