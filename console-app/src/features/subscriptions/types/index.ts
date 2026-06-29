export type PlanTierSlug = "free" | "starter" | "pro" | "max" | "enterprise";

export type PlanSlug =
  | PlanTierSlug
  | "starter-monthly"
  | "starter-quarterly"
  | "starter-yearly"
  | "pro-monthly"
  | "pro-quarterly"
  | "pro-yearly"
  | "max-monthly"
  | "max-quarterly"
  | "max-yearly";

export type BillingCycleSlug = "monthly" | "quarterly" | "yearly";

export type BillingCycle = {
  slug: BillingCycleSlug;
  label: string;
  badge: string | null;
  discountPercent: number;
  sortOrder: number;
};

export type PlansListData = {
  plans: Plan[];
  billingCycles: BillingCycle[];
};

export type { PlanFeatures, PlanFeatureDisplayRow } from "./plan-features";
import type { PlanFeatures, PlanFeatureDisplayRow } from "./plan-features";

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "incomplete"
  | "unpaid";

export type PendingDowngradeStatus = "scheduled";

export type Plan = {
  id: string;
  slug: PlanSlug;
  tierSlug: PlanTierSlug;
  billingCycle: BillingCycleSlug;
  name: string;
  description: string | null;
  price: number;
  listPrice: number | null;
  features: PlanFeatures;
  featureRows: PlanFeatureDisplayRow[];
  serverBadge: string;
  sortOrder: number;
};

export type Subscription = {
  id: string;
  plan: Plan;
  pendingPlan: Plan | null;
  scheduledChangeAt: number | null;
  pendingDowngradeStatus: PendingDowngradeStatus | null;
  subscriptionStatus: SubscriptionStatus;
  startedAt: number;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  canceledAt: number | null;
  billingAmount: number;
  billingCycle: BillingCycleSlug;
  stripeCustomerId: string | null;
};

export type SubscriptionsApiResponse<T = unknown> = {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
};

export type ChangePlanRequest = {
  planSlug: PlanSlug;
};

export type CancelSubscriptionRequest = {
  reason: string;
};

export type CheckoutRequest = {
  planSlug: PlanSlug;
  startPayment?: boolean;
  billingCycle?: BillingCycleSlug;
};

export type CheckoutPaymentMethod = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export type CheckoutResponse = {
  clientSecret: string | null;
  publishableKey: string;
  plan: Plan;
  proratedUpgrade?: boolean;
  amountDue?: number;
  immediate?: boolean;
  subscription?: Subscription;
  paymentMethod?: CheckoutPaymentMethod | null;
};
