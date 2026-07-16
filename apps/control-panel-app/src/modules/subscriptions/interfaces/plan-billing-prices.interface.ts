import { BillingCycleSlug } from "../enums/billing-cycle.enum";

export interface PlanBillingCyclePrice {
  amountMonthly: number;
  stripePriceId: string | null;
}

export type PlanBillingPrices = Partial<
  Record<BillingCycleSlug, PlanBillingCyclePrice>
>;
