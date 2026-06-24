import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getErrorMessage, toApiError } from "@/api/api-error";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { QUERY_KEYS } from "@/constants/query-keys";
import {
  cancelSubscription,
  cancelPendingDowngrade,
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

export function useCurrentSubscriptionQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.subscriptions.current,
    queryFn: fetchCurrentSubscription,
    refetchOnMount: true,
  });
}

export function useCheckoutSetupQuery(planSlug: PlanSlug) {
  return useQuery({
    queryKey: QUERY_KEYS.subscriptions.checkout(planSlug),
    queryFn: () => createCheckoutPayment({ planSlug }),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
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

export function useCancelPendingDowngradeMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { subscription: unknown; message: string },
    ApiError,
    void
  >({
    mutationFn: withSubscriptionError(() => cancelPendingDowngrade()),
    onSuccess: ({ subscription, message }) => {
      queryClient.setQueryData(
        QUERY_KEYS.subscriptions.current,
        subscription,
      );
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
  const order: PlanSlug[] = ["free", "starter", "pro", "max", "enterprise"];
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
