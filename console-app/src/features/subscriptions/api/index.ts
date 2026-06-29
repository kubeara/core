import { apiClient } from "@/api/axios";
import type {
  BillingCycle,
  CancelSubscriptionRequest,
  ChangePlanRequest,
  CheckoutRequest,
  CheckoutResponse,
  Plan,
  PlansListData,
  Subscription,
  SubscriptionsApiResponse,
} from "../types";
import { getPlanTierSlug } from "../plan-slug.util";

type RawPlan = Plan & { priceMonthly?: number; priceMonthlyCents?: number; listPriceMonthly?: number | null };
type RawSubscription = Subscription & {
  billingAmountCents?: number;
  plan?: RawPlan;
};

function resolvePlanPrice(plan: RawPlan): number {
  const price = Number(plan.price ?? plan.priceMonthly);
  if (Number.isFinite(price)) {
    return price;
  }
  const legacyCents = Number(plan.priceMonthlyCents);
  if (Number.isFinite(legacyCents)) {
    return legacyCents / 100;
  }
  return 0;
}

function normalizePlan(plan: RawPlan): Plan {
  return {
    ...plan,
    price: resolvePlanPrice(plan),
    tierSlug: plan.tierSlug ?? getPlanTierSlug(plan.slug),
    billingCycle: plan.billingCycle ?? "monthly",
    listPrice:
      plan.listPrice == null && plan.listPriceMonthly == null
        ? null
        : Number(plan.listPrice ?? plan.listPriceMonthly) || 0,
    features: plan.features ?? ({} as Plan["features"]),
    featureRows: plan.featureRows ?? [],
    serverBadge: plan.serverBadge ?? "",
  };
}

function normalizeSubscription(subscription: RawSubscription): Subscription {
  const billing = Number(subscription.billingAmount);
  const legacyBilling = Number(subscription.billingAmountCents);
  return {
    ...subscription,
    plan: normalizePlan(subscription.plan ?? ({} as RawPlan)),
    pendingPlan: subscription.pendingPlan
      ? normalizePlan(subscription.pendingPlan as RawPlan)
      : null,
    scheduledChangeAt: subscription.scheduledChangeAt ?? null,
    pendingDowngradeStatus: subscription.pendingDowngradeStatus ?? null,
    billingAmount: Number.isFinite(billing)
      ? billing
      : Number.isFinite(legacyBilling)
        ? legacyBilling / 100
        : resolvePlanPrice(subscription.plan ?? ({} as RawPlan)),
    billingCycle: subscription.billingCycle ?? "monthly",
  };
}

type RawPlansListData = {
  plans?: RawPlan[];
  billingCycles?: BillingCycle[];
};

const DEFAULT_BILLING_CYCLES: BillingCycle[] = [
  { slug: "monthly", label: "Monthly", badge: null, discountPercent: 0, sortOrder: 0 },
  { slug: "quarterly", label: "Quarterly", badge: null, discountPercent: 10, sortOrder: 1 },
  { slug: "yearly", label: "Yearly", badge: "Save 50%", discountPercent: 50, sortOrder: 2 },
];

export function getPlanBillingDisplay(plan: Plan): {
  display: number;
  original: number;
  hasDiscount: boolean;
} {
  const display = plan.price;
  const original = plan.listPrice ?? plan.price;
  return {
    display,
    original,
    hasDiscount: original > display && original > 0,
  };
}

export async function fetchPlans(): Promise<PlansListData> {
  const response = await apiClient.get<
    SubscriptionsApiResponse<RawPlan[] | RawPlansListData>
  >("/subscriptions/plans");
  const data = response.data.data;

  if (Array.isArray(data)) {
    return {
      plans: data.map(normalizePlan),
      billingCycles: DEFAULT_BILLING_CYCLES,
    };
  }

  return {
    plans: (data?.plans ?? []).map(normalizePlan),
    billingCycles: data?.billingCycles?.length
      ? data.billingCycles
      : DEFAULT_BILLING_CYCLES,
  };
}

export async function fetchCurrentSubscription(): Promise<Subscription> {
  const response = await apiClient.get<SubscriptionsApiResponse<RawSubscription>>(
    "/subscriptions/current",
  );
  const subscription = response.data.data;
  if (!subscription) {
    throw new Error("No subscription data in response");
  }
  return normalizeSubscription(subscription);
}

type RawCheckoutResponse = CheckoutResponse & {
  subscription?: RawSubscription;
};

export async function createCheckoutPayment(
  input: CheckoutRequest,
): Promise<CheckoutResponse> {
  const response = await apiClient.post<
    SubscriptionsApiResponse<RawCheckoutResponse>
  >("/subscriptions/checkout", input);
  const data = response.data.data;
  if (!data?.publishableKey) {
    throw new Error("No checkout payment data in response");
  }
  if (!data.proratedUpgrade && !data.clientSecret && !data.immediate) {
    throw new Error("No checkout payment data in response");
  }
  return {
    ...data,
    subscription: data.subscription
      ? normalizeSubscription(data.subscription)
      : undefined,
  };
}

export async function confirmCheckoutPayment(
  input: CheckoutRequest,
): Promise<{ subscription: Subscription; message: string }> {
  const response = await apiClient.post<
    SubscriptionsApiResponse<RawSubscription>
  >("/subscriptions/confirm", input);
  const subscription = response.data.data;
  if (!subscription) {
    throw new Error("No subscription data in response");
  }
  return {
    subscription: normalizeSubscription(subscription),
    message: response.data.message ?? "Subscription confirmed successfully",
  };
}

export async function cancelPendingDowngrade(): Promise<{
  subscription: Subscription;
  message: string;
}> {
  const response = await apiClient.post<
    SubscriptionsApiResponse<RawSubscription>
  >("/subscriptions/cancel-pending-downgrade");
  const subscription = response.data.data;
  if (!subscription) {
    throw new Error("No subscription data in response");
  }
  return {
    subscription: normalizeSubscription(subscription),
    message:
      response.data.message ?? "Scheduled plan change canceled successfully",
  };
}

export async function changePlan(
  input: ChangePlanRequest,
): Promise<{ subscription: Subscription; message: string }> {
  const response = await apiClient.post<
    SubscriptionsApiResponse<RawSubscription>
  >("/subscriptions/change-plan", input);
  const subscription = response.data.data;
  if (!subscription) {
    throw new Error("No subscription data in response");
  }
  return {
    subscription: normalizeSubscription(subscription),
    message: response.data.message ?? "Plan changed successfully",
  };
}

export async function cancelSubscription(input: CancelSubscriptionRequest): Promise<{
  subscription: Subscription;
  message: string;
}> {
  const response = await apiClient.post<
    SubscriptionsApiResponse<RawSubscription>
  >("/subscriptions/cancel", input);
  const subscription = response.data.data;
  if (!subscription) {
    throw new Error("No subscription data in response");
  }
  return {
    subscription: normalizeSubscription(subscription),
    message: response.data.message ?? "Subscription canceled",
  };
}
