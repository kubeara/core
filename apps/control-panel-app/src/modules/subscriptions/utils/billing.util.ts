import { BillingCycleSlug } from "../enums/billing-cycle.enum";
import { PlanEntity } from "../entities/plan.entity";
import { getPlanBillingCycleFromSlug } from "./plan-slug.util";

export function normalizeBillingCycleSlug(
  value?: string | null,
): BillingCycleSlug {
  if (value === BillingCycleSlug.QUARTERLY) {
    return BillingCycleSlug.QUARTERLY;
  }
  if (value === BillingCycleSlug.YEARLY) {
    return BillingCycleSlug.YEARLY;
  }
  return BillingCycleSlug.MONTHLY;
}

export function getPlanPrice(plan: PlanEntity): number {
  return Number(plan.price) || 0;
}

export function resolvePlanStripePriceId(plan: PlanEntity): string | null {
  return plan.stripePriceId;
}

export function collectPlanStripePriceIds(plan: PlanEntity): string[] {
  return plan.stripePriceId ? [plan.stripePriceId] : [];
}

export function resolveBillingCycleFromPlan(
  plan: PlanEntity,
): BillingCycleSlug {
  return normalizeBillingCycleSlug(
    plan.billingCycle ?? getPlanBillingCycleFromSlug(plan.slug),
  );
}
