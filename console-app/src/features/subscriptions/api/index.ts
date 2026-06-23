import { apiClient } from "@/api/axios";
import type {
  ChangePlanRequest,
  CheckoutRequest,
  CheckoutResponse,
  Plan,
  Subscription,
  SubscriptionsApiResponse,
} from "../types";

type RawPlan = Plan & { priceMonthlyCents?: number };
type RawSubscription = Subscription & {
  billingAmountCents?: number;
  plan?: RawPlan;
};

function resolveMonthlyPrice(plan: RawPlan): number {
  const monthly = Number(plan.priceMonthly);
  if (Number.isFinite(monthly)) {
    return monthly;
  }
  const legacyCents = Number(plan.priceMonthlyCents);
  if (Number.isFinite(legacyCents)) {
    return legacyCents / 100;
  }
  return 0;
}

function normalizePlan(plan: RawPlan): Plan {
  return { ...plan, priceMonthly: resolveMonthlyPrice(plan) };
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
    billingAmount: Number.isFinite(billing)
      ? billing
      : Number.isFinite(legacyBilling)
        ? legacyBilling / 100
        : resolveMonthlyPrice(subscription.plan ?? ({} as RawPlan)),
  };
}

export async function fetchPlans(): Promise<Plan[]> {
  const response =
    await apiClient.get<SubscriptionsApiResponse<RawPlan[]>>("/subscriptions/plans");
  return (response.data.data ?? []).map(normalizePlan);
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

export async function createCheckoutPayment(
  input: CheckoutRequest,
): Promise<CheckoutResponse> {
  const response = await apiClient.post<
    SubscriptionsApiResponse<CheckoutResponse>
  >("/subscriptions/checkout", input);
  const data = response.data.data;
  if (!data?.clientSecret || !data.publishableKey) {
    throw new Error("No checkout payment data in response");
  }
  return data;
}

export async function confirmCheckoutPayment(
  input: CheckoutRequest,
): Promise<Subscription> {
  const response = await apiClient.post<
    SubscriptionsApiResponse<RawSubscription>
  >("/subscriptions/confirm", input);
  const subscription = response.data.data;
  if (!subscription) {
    throw new Error("No subscription data in response");
  }
  return normalizeSubscription(subscription);
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

export async function cancelSubscription(): Promise<{
  subscription: Subscription;
  message: string;
}> {
  const response = await apiClient.post<
    SubscriptionsApiResponse<RawSubscription>
  >("/subscriptions/cancel");
  const subscription = response.data.data;
  if (!subscription) {
    throw new Error("No subscription data in response");
  }
  return {
    subscription: normalizeSubscription(subscription),
    message: response.data.message ?? "Subscription canceled",
  };
}
