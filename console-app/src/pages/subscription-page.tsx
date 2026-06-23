import { Link } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { BackLink } from "@/components/shared/back-link";
import { ProfilePageSkeleton } from "@/components/shared/skeleton";
import {
  formatPrice,
  formatStatus,
  formatUnixDate,
  useCancelPendingDowngradeMutation,
  useCancelSubscriptionMutation,
  useCurrentSubscriptionQuery,
} from "@/features/subscriptions/hooks";
import "@/features/subscriptions/subscriptions-ui.css";

export function SubscriptionPage() {
  const { data: subscription, isPending, isError, error } =
    useCurrentSubscriptionQuery();
  const cancelMutation = useCancelSubscriptionMutation();
  const cancelPendingMutation = useCancelPendingDowngradeMutation();

  if (isPending) {
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
  const hasScheduledChange =
    subscription.pendingDowngradeStatus === "scheduled" &&
    !!subscription.pendingPlan;
  const isCancelScheduled = subscription.pendingPlan?.slug === "free";
  const canCancel =
    !isFree && subscription.subscriptionStatus === "active" && !hasScheduledChange;
  const canCancelScheduledChange = hasScheduledChange;

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
        </section>

        {hasScheduledChange && subscription.pendingPlan && (
          <section className="profile-section-card">
            <h2>Scheduled change</h2>
            <p className="profile-section-desc subscription-notice">
              {isCancelScheduled ? (
                <>
                  Your subscription is canceled. You will not be charged again.
                  <br />
                  Access to {subscription.plan.name} continues until{" "}
                  {formatUnixDate(subscription.scheduledChangeAt)}.
                </>
              ) : (
                <>
                  Downgrade to {subscription.pendingPlan.name} (
                  {formatPrice(subscription.pendingPlan.priceMonthly)}/month)
                  <br />
                  Effective on {formatUnixDate(subscription.scheduledChangeAt)}.
                </>
              )}
            </p>
          </section>
        )}

        <section className="profile-section-card">
          <div className="subscription-actions">
            <Link to="/plans" className="btn-primary">
              View plans
            </Link>
            {canCancelScheduledChange && (
              <button
                type="button"
                className="btn-secondary"
                disabled={cancelPendingMutation.isPending}
                onClick={() => cancelPendingMutation.mutate()}
              >
                {cancelPendingMutation.isPending
                  ? "Canceling…"
                  : "Cancel scheduled change"}
              </button>
            )}
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
