import { Link, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { getErrorMessage } from "@/api/api-error";
import { BackLink } from "@/components/shared/back-link";
import { ProfilePageSkeleton } from "@/components/shared/skeleton";
import {
  formatPrice,
  formatStatus,
  formatUnixDate,
  useCancelSubscriptionMutation,
  useCurrentSubscriptionQuery,
} from "@/features/subscriptions/hooks";
import type { PlanSlug } from "@/features/subscriptions/types";
import { showSuccessToast } from "@/lib/toast";
import "@/features/subscriptions/subscriptions-ui.css";

const PAID_PLAN_SLUGS: PlanSlug[] = ["starter", "pro", "business"];

export function SubscriptionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const checkoutSuccess = searchParams.get("checkout") === "success";
  const expectedPlanParam = searchParams.get("plan");
  const expectedPlan = PAID_PLAN_SLUGS.includes(expectedPlanParam as PlanSlug)
    ? (expectedPlanParam as PlanSlug)
    : null;
  const pollUntilPlan = checkoutSuccess ? expectedPlan : null;

  const { data: subscription, isPending, isError, error } =
    useCurrentSubscriptionQuery({ pollUntilPlan });
  const cancelMutation = useCancelSubscriptionMutation();

  const isAwaitingCheckoutUpdate =
    !!pollUntilPlan &&
    (!subscription ||
      subscription.plan.slug !== pollUntilPlan ||
      subscription.subscriptionStatus !== "active");

  useEffect(() => {
    if (!checkoutSuccess || !expectedPlan || isAwaitingCheckoutUpdate) {
      return;
    }

    showSuccessToast("Subscription updated successfully");
    setSearchParams({}, { replace: true });
  }, [
    checkoutSuccess,
    expectedPlan,
    isAwaitingCheckoutUpdate,
    setSearchParams,
  ]);

  if (isPending || isAwaitingCheckoutUpdate) {
    return <ProfilePageSkeleton />;
  }

  if (isError || !subscription) {
    return (
      <div className="profile-page">
        <BackLink to="/servers" label="Back" />
        <div className="profile-section-card">
          <p className="form-field-error">
            {isError ? getErrorMessage(error) : "No subscription found"}
          </p>
        </div>
      </div>
    );
  }

  const isFree = subscription.plan.slug === "free";
  const canCancel = !isFree && subscription.subscriptionStatus === "active";

  return (
    <div className="profile-page">
      <BackLink to="/servers" label="Back" />

      <header className="dashboard-header">
        <div>
          <h1>Subscription</h1>
          <p>Manage your billing and plan.</p>
        </div>
      </header>

      <div className="profile-page-body">
        <section className="profile-section-card">
          <h2>Current plan</h2>
          <p className="profile-section-desc">
            {subscription.plan.name} — {formatPrice(subscription.billingAmount)}/month
          </p>
          {subscription.pendingPlan && (
            <p className="profile-section-desc">
              Downgrade to {subscription.pendingPlan.name} scheduled for{" "}
              {formatUnixDate(subscription.scheduledChangeAt)}
            </p>
          )}

          <div className="subscription-details-grid">
            <div className="subscription-detail-item">
              <span className="subscription-detail-label">Status</span>
              <span className="subscription-detail-value">
                {formatStatus(subscription.subscriptionStatus)}
              </span>
            </div>
            <div className="subscription-detail-item">
              <span className="subscription-detail-label">Start date</span>
              <span className="subscription-detail-value">
                {formatUnixDate(subscription.startedAt)}
              </span>
            </div>
            <div className="subscription-detail-item">
              <span className="subscription-detail-label">Renewal date</span>
              <span className="subscription-detail-value">
                {formatUnixDate(subscription.currentPeriodEnd)}
              </span>
            </div>
            <div className="subscription-detail-item">
              <span className="subscription-detail-label">Billing amount</span>
              <span className="subscription-detail-value">
                {formatPrice(subscription.billingAmount)}/month
              </span>
            </div>
          </div>

          <div className="subscription-actions">
            <Link to="/plans" className="btn-primary">
              View plans
            </Link>
            {canCancel && (
              <button
                type="button"
                className="btn-secondary btn-danger-outline"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? "Canceling…" : "Cancel subscription"}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
