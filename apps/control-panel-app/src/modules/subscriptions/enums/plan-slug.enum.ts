export enum PlanSlug {
  FREE = "free",
  STARTER_MONTHLY = "starter-monthly",
  STARTER_QUARTERLY = "starter-quarterly",
  STARTER_YEARLY = "starter-yearly",
  PRO_MONTHLY = "pro-monthly",
  PRO_QUARTERLY = "pro-quarterly",
  PRO_YEARLY = "pro-yearly",
  MAX_MONTHLY = "max-monthly",
  MAX_QUARTERLY = "max-quarterly",
  MAX_YEARLY = "max-yearly",
  ENTERPRISE = "enterprise",
}

export type PlanTierSlug = "free" | "starter" | "pro" | "max" | "enterprise";

export const PLAN_TIER_ORDER: PlanTierSlug[] = [
  "free",
  "starter",
  "pro",
  "max",
  "enterprise",
];
