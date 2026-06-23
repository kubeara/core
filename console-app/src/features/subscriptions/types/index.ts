export type PlanSlug = "free" | "starter" | "pro" | "business";

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "trialing"
  | "incomplete"
  | "unpaid";

export type Plan = {
  id: string;
  slug: PlanSlug;
  name: string;
  description: string | null;
  priceMonthly: number;
  features: string[];
  sortOrder: number;
};

export type Subscription = {
  id: string;
  plan: Plan;
  pendingPlan: Plan | null;
  scheduledChangeAt: number | null;
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
};

export type CheckoutResponse = {
  clientSecret: string;
  publishableKey: string;
  plan: Plan;
};
