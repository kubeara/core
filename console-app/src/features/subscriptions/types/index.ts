export type PlanSlug = "free" | "starter" | "pro" | "max" | "enterprise";

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
  name: string;
  description: string | null;
  priceMonthly: number;
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

export type CheckoutRequest = {
  planSlug: PlanSlug;
  startPayment?: boolean;
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
  paymentMethod?: CheckoutPaymentMethod | null;
};
