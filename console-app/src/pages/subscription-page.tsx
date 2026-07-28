import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getErrorMessage } from "@/api/api-error";
import { BackLink } from "@/components/shared/back-link";
import { ProfilePageSkeleton } from "@/components/shared/skeleton";
import {
  formatBillingInterval,
  formatPrice,
  formatStatus,
  formatUnixDate,
  useCancelPendingDowngradeMutation,
  useCancelSubscriptionMutation,
  useCurrentSubscriptionQuery,
} from "@/features/subscriptions/hooks";
import "@/features/subscriptions/subscriptions-ui.css";

export function SubscriptionPage() {
  const {
    data: subscription,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useCurrentSubscriptionQuery();
  const cancelMutation = useCancelSubscriptionMutation();
  const cancelPendingMutation = useCancelPendingDowngradeMutation();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelScheduledModalOpen, setCancelScheduledModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (!cancelModalOpen && !cancelScheduledModalOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (cancelMutation.isPending || cancelPendingMutation.isPending) return;
      if (cancelModalOpen) {
        setCancelModalOpen(false);
        setCancelReason("");
      }
      if (cancelScheduledModalOpen) setCancelScheduledModalOpen(false);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [
    cancelModalOpen,
    cancelScheduledModalOpen,
    cancelMutation.isPending,
    cancelPendingMutation.isPending,
  ]);

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

      <header className="dashboard-header subscription-page-header">
        <div>
          <h1>Subscription</h1>
          <p>Manage your billing and plan.</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <div className="profile-page-body">
        <section className="profile-section-card">
          <h2>Current plan</h2>
          <p className="profile-section-desc">
            {subscription.plan.name} — {formatPrice(subscription.billingAmount)}
            {formatBillingInterval(subscription.billingCycle)}
            {subscription.promoCode && subscription.billingDiscountAmount > 0 && (
              <>
                {" "}
                <span className="subscription-promo-badge">
                  ({subscription.promoCode})
                </span>
              </>
            )}
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
            {subscription.billingDiscountAmount > 0 && (
              <>
                <div className="subscription-detail-item">
                  <span className="subscription-detail-label">Plan amount</span>
                  <span className="subscription-detail-value">
                    {formatPrice(subscription.billingListAmount ?? subscription.billingAmount)}
                    {formatBillingInterval(subscription.billingCycle)}
                  </span>
                </div>
                <div className="subscription-detail-item">
                  <span className="subscription-detail-label">Promo discount</span>
                  <span className="subscription-detail-value subscription-promo-discount">
                    -{formatPrice(subscription.billingDiscountAmount)}
                    {subscription.promoCode ? ` (${subscription.promoCode})` : ""}
                  </span>
                </div>
              </>
            )}
            <div className="subscription-detail-item">
              <span className="subscription-detail-label">
                {subscription.billingDiscountAmount > 0
                  ? "Amount payable"
                  : "Billing amount"}
              </span>
              <span className="subscription-detail-value">
                {formatPrice(subscription.billingAmount)}
                {formatBillingInterval(subscription.billingCycle)}
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
                  {formatPrice(subscription.pendingPlan.price)}
                  {formatBillingInterval(subscription.pendingPlan.billingCycle)})
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
                onClick={() => setCancelScheduledModalOpen(true)}
              >
                Keep
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className="btn-secondary btn-danger-outline"
                disabled={cancelMutation.isPending}
                  onClick={() => {
                    setCancelReason("");
                    setCancelModalOpen(true);
                  }}
              >
                Cancel
              </button>
            )}
          </div>
        </section>
      </div>

      {cancelModalOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-subscription-title"
          onClick={() => {
            if (cancelMutation.isPending) return;
            setCancelModalOpen(false);
            setCancelReason("");
          }}
        >
          <div
            className="modal-dialog modal-dialog-sm subscription-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="cancel-subscription-title">Cancel subscription?</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                disabled={cancelMutation.isPending}
                onClick={() => {
                  setCancelModalOpen(false);
                  setCancelReason("");
                }}
              >
                ×
              </button>
            </div>
            <p className="modal-body-text">
              You will keep access to {subscription.plan.name} until{" "}
              {formatUnixDate(subscription.currentPeriodEnd)}. After that, your
              subscription will be canceled and you will not be charged again.
            </p>
            <textarea
              className="subscription-cancel-reason"
              placeholder="Reason for cancellation"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={3}
              disabled={cancelMutation.isPending}
            />
            <div className="modal-actions modal-actions-single">
              <button
                type="button"
                className={`btn-danger-outline${cancelMutation.isPending ? " is-loading" : ""}`}
                disabled={cancelMutation.isPending || !cancelReason.trim()}
                aria-busy={cancelMutation.isPending}
                onClick={() =>
                  cancelMutation.mutate({ reason: cancelReason.trim() }, {
                    onSuccess: () => {
                      setCancelModalOpen(false);
                      setCancelReason("");
                    },
                  })
                }
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelScheduledModalOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-scheduled-title"
          onClick={() =>
            !cancelPendingMutation.isPending && setCancelScheduledModalOpen(false)
          }
        >
          <div
            className="modal-dialog modal-dialog-sm subscription-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="cancel-scheduled-title">Discard scheduled change?</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                disabled={cancelPendingMutation.isPending}
                onClick={() => setCancelScheduledModalOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="modal-body-text">
              {isCancelScheduled ? (
                <>
                  You will keep access to {subscription.plan.name} and billing
                  will continue as usual. Your subscription will no longer be
                  scheduled to cancel.
                </>
              ) : (
                <>
                  You will stay on {subscription.plan.name}. The scheduled change
                  to {subscription.pendingPlan?.name} on{" "}
                  {formatUnixDate(subscription.scheduledChangeAt)} will be
                  removed.
                </>
              )}
            </p>
            <div className="modal-actions modal-actions-single">
              <button
                type="button"
                className={`btn-danger-outline${cancelPendingMutation.isPending ? " is-loading" : ""}`}
                disabled={cancelPendingMutation.isPending}
                aria-busy={cancelPendingMutation.isPending}
                onClick={() =>
                  cancelPendingMutation.mutate(undefined, {
                    onSuccess: () => setCancelScheduledModalOpen(false),
                  })
                }
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
