import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getErrorMessage, toApiError } from "@/api/api-error";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { QUERY_KEYS } from "@/constants/query-keys";
import {
  cancelSubscription,
  changePlan,
  createCheckoutPayment,
  fetchCurrentSubscription,
  fetchPlans,
} from "../api";
import type { ChangePlanRequest, PlanSlug } from "../types";

function withSubscriptionError<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
): (variables: TVariables) => Promise<TData> {
  return async (variables: TVariables) => {
    try {
      return await mutationFn(variables);
    } catch (error) {
      throw toApiError(error);
    }
  };
}

export function usePlansQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.subscriptions.plans,
    queryFn: fetchPlans,
  });
}

export function useCurrentSubscriptionQuery(options?: {
  pollUntilPlan?: PlanSlug | null;
}) {
  const expectedPlan = options?.pollUntilPlan ?? null;

  return useQuery({
    queryKey: QUERY_KEYS.subscriptions.current,
    queryFn: fetchCurrentSubscription,
    staleTime: expectedPlan ? 0 : undefined,
    refetchOnMount: expectedPlan ? "always" : true,
    refetchInterval: expectedPlan
      ? (query) => {
          const subscription = query.state.data;
          if (
            subscription?.plan.slug === expectedPlan &&
            subscription.subscriptionStatus === "active"
          ) {
            return false;
          }
          return 1500;
        }
      : false,
  });
}

export function useCheckoutSetupQuery(planSlug: PlanSlug) {
  return useQuery({
    queryKey: QUERY_KEYS.subscriptions.checkout(planSlug),
    queryFn: () => createCheckoutPayment({ planSlug }),
    staleTime: 0,
    retry: false,
  });
}

export function useChangePlanMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { subscription: unknown; message: string },
    ApiError,
    ChangePlanRequest
  >({
    mutationFn: withSubscriptionError(changePlan),
    onSuccess: ({ message }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.subscriptions.current,
      });
      showSuccessToast(message);
    },
    onError: (error) => {
      showErrorToast(getErrorMessage(error));
    },
  });
}

export function useCancelSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { subscription: unknown; message: string },
    ApiError,
    void
  >({
    mutationFn: withSubscriptionError(() => cancelSubscription()),
    onSuccess: ({ message }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.subscriptions.current,
      });
      showSuccessToast(message);
    },
    onError: (error) => {
      showErrorToast(getErrorMessage(error));
    },
  });
}

export function getPlanAction(
  currentSlug: PlanSlug | undefined,
  targetSlug: PlanSlug,
): "current" | "upgrade" | "downgrade" {
  if (currentSlug === targetSlug) return "current";
  const order: PlanSlug[] = ["free", "starter", "pro", "business"];
  const currentIdx = order.indexOf(currentSlug ?? "free");
  const targetIdx = order.indexOf(targetSlug);
  return targetIdx > currentIdx ? "upgrade" : "downgrade";
}

export function formatPrice(amount?: number | null): string {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "$0";
  return `$${value}`;
}

export function formatUnixDate(unix: number | null): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
