import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { BackLink } from "@/components/shared/back-link";
import { SkeletonGrid } from "@/components/shared/skeleton";
import {
  formatPrice,
  formatStatus,
  formatUnixDate,
  getPlanAction,
  setCurrentSubscriptionCache,
  useCancelPendingDowngradeMutation,
  useCancelSubscriptionMutation,
  useChangePlanMutation,
  useCurrentSubscriptionQuery,
  usePlansQuery,
} from "@/features/subscriptions/hooks";
import { confirmCheckoutPayment } from "@/features/subscriptions/api";
import type { Plan, PlanSlug } from "@/features/subscriptions/types";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/query-keys";
import "@/features/subscriptions/subscriptions-ui.css";

const CHECKOUT_PLAN_SLUGS: PlanSlug[] = ["starter", "pro", "max"];

const PLAN_ORDER: PlanSlug[] = ["free", "starter", "pro", "max", "enterprise"];

function PlanCard({
  plan,
  currentSlug,
  scheduledPlanSlug,
}: {
  plan: Plan;
  currentSlug: PlanSlug | undefined;
  scheduledPlanSlug?: PlanSlug | null;
}) {
  const navigate = useNavigate();
  const changePlanMutation = useChangePlanMutation();
  const action = getPlanAction(currentSlug, plan.slug);
  const isPending = changePlanMutation.isPending;

  function handleAction() {
    if (plan.slug === "enterprise") {
      window.location.href =
        "mailto:support@kubeara.com?subject=Enterprise%20plan";
      return;
    }
    if (action === "upgrade") {
      navigate(`/checkout/${plan.slug}`);
      return;
    }
    if (action === "downgrade") {
      changePlanMutation.mutate({ planSlug: plan.slug });
    }
  }

  const isEnterprise = plan.slug === "enterprise";
  const currentIdx = PLAN_ORDER.indexOf(currentSlug ?? "free");
  const proIdx = PLAN_ORDER.indexOf("pro");
  const isPopular =
    plan.slug === "pro" && currentIdx < proIdx && action !== "current";
  const isScheduledTarget = scheduledPlanSlug === plan.slug;
  const ctaLabel = isEnterprise
    ? "Contact support team"
    : isScheduledTarget
      ? "Scheduled"
      : action === "upgrade"
        ? "Upgrade"
        : action === "downgrade"
          ? "Downgrade"
          : "Upgrade";

  function getCtaClassName(): string {
    if (isScheduledTarget) {
      return "plan-card-cta plan-card-cta-outline";
    }
    if (action === "upgrade") {
      return `plan-card-cta plan-card-cta-upgrade${isPopular ? "" : " plan-card-cta-upgrade-outline"}`;
    }
    if (action === "downgrade") {
      return "plan-card-cta plan-card-cta-downgrade";
    }
    if (isEnterprise) {
      return "plan-card-cta plan-card-cta-outline";
    }
    return "plan-card-cta plan-card-cta-upgrade plan-card-cta-upgrade-outline";
  }

  return (
    <article
      className={`plan-card${action === "current" ? " is-current" : ""}${isPopular ? " is-popular" : ""}`}
    >
      {isPopular && (
        <span className="plan-card-popular-badge">Most popular</span>
      )}
      <div className="plan-card-header">
        <h3>{plan.name}</h3>
        {plan.description && (
          <p className="plan-card-desc">{plan.description}</p>
        )}
        <p
          className={`plan-card-price${isEnterprise ? " plan-card-price-contact" : ""}`}
        >
          {isEnterprise ? (
            "Contact support team"
          ) : (
            <>
              {formatPrice(plan.priceMonthly)}
              <span>/month</span>
            </>
          )}
        </p>
        {plan.serverBadge && (
          <span className="plan-card-chip">{plan.serverBadge}</span>
        )}
      </div>
      <ul className="plan-card-features">
        {plan.featureRows.map((feature) => (
          <li
            key={feature.key}
            className={`plan-feature-row${feature.includes ? " plan-feature-includes" : ""}`}
          >
            <span className="plan-feature-check" aria-hidden="true" />
            <span className="plan-feature-label">{feature.label}</span>
            {!feature.includes && feature.value && (
              <span
                className={`plan-feature-value${feature.accent ? " is-accent" : ""}`}
              >
                {feature.value}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="plan-card-actions">
        {action === "current" ? (
          <button
            type="button"
            className="plan-card-cta plan-card-cta-outline"
            disabled
          >
            Current plan
          </button>
        ) : (
          <button
            type="button"
            className={getCtaClassName()}
            disabled={isPending || isScheduledTarget}
            onClick={handleAction}
          >
            {isPending ? "Processing…" : ctaLabel}
          </button>
        )}
      </div>
    </article>
  );
}

export function PlansPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const {
    data: plans,
    isPending: plansPending,
    isError: plansError,
    error: plansErr,
  } = usePlansQuery();
  const { data: subscription, isPending: subPending } =
    useCurrentSubscriptionQuery();
  const cancelMutation = useCancelSubscriptionMutation();
  const cancelPendingMutation = useCancelPendingDowngradeMutation();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelScheduledModalOpen, setCancelScheduledModalOpen] = useState(false);
  const [isCompletingCheckout, setIsCompletingCheckout] = useState(
    () => searchParams.get("checkout") === "success",
  );

  const isLoading = plansPending || subPending || isCompletingCheckout;
  const hasScheduledChange =
    subscription?.pendingDowngradeStatus === "scheduled" &&
    !!subscription?.pendingPlan;
  const isCancelScheduled = subscription?.pendingPlan?.slug === "free";
  const isFree = subscription?.plan.slug === "free";
  const canCancel =
    !isFree &&
    subscription?.subscriptionStatus === "active" &&
    !hasScheduledChange;
  const canCancelScheduledChange = hasScheduledChange;

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const plan = searchParams.get("plan");
    if (
      checkout !== "success" ||
      !plan ||
      !CHECKOUT_PLAN_SLUGS.includes(plan as PlanSlug)
    ) {
      return;
    }

    let cancelled = false;
    setIsCompletingCheckout(true);

    void confirmCheckoutPayment({ planSlug: plan as PlanSlug })
      .then(async (subscription) => {
        if (cancelled) return;
        setCurrentSubscriptionCache(queryClient, subscription);
        await queryClient.refetchQueries({
          queryKey: QUERY_KEYS.subscriptions.current,
        });
      })
      .finally(() => {
        if (cancelled) return;
        setIsCompletingCheckout(false);
        navigate("/plans", { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient, searchParams]);

  return (
    <div className="profile-page">
      <BackLink to="/servers" label="Back" />

      <header className="dashboard-header">
        <div>
          <h1>Plans</h1>
        </div>
      </header>

      {isLoading && <SkeletonGrid count={5} label="Loading plans…" />}

      {plansError && (
        <div className="profile-section-card">
          <p className="form-field-error">{getErrorMessage(plansErr)}</p>
        </div>
      )}

      {!isLoading && subscription && (
        <div className="profile-page-body">
          <section className="profile-section-card">
            <div className="subscription-block">
              <div className="subscription-section-header">
                <h2>Current subscription</h2>
                <p className="profile-section-desc">
                  {subscription.plan.name} — {formatPrice(subscription.billingAmount)}/month
                </p>
              </div>
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
              {canCancel && (
                <div className="subscription-section-action">
                  <button
                    type="button"
                    className="btn-secondary btn-danger-outline"
                    disabled={cancelMutation.isPending}
                    onClick={() => setCancelModalOpen(true)}
                  >
                    Cancel Subscription
                  </button>
                </div>
              )}
            </div>

            {hasScheduledChange && subscription.pendingPlan && (
              <>
                <hr className="subscription-section-divider" />
                <div className="subscription-block">
                  <div className="subscription-section-header">
                    <h2>Scheduled change</h2>
                    {isCancelScheduled ? (
                      <p className="profile-section-desc subscription-notice">
                        Your subscription is canceled on{" "}
                        {formatUnixDate(subscription.scheduledChangeAt)}.
                      </p>
                    ) : (
                      <p className="profile-section-desc">
                        {subscription.pendingPlan.name} —{" "}
                        {formatPrice(subscription.pendingPlan.priceMonthly)}/month
                      </p>
                    )}
                  </div>
                  <div className="subscription-details-grid">
                    <div className="subscription-detail-item">
                      <span className="subscription-detail-label">Status</span>
                      <span className="subscription-detail-value">
                        {isCancelScheduled ? "Canceling" : "Scheduled"}
                      </span>
                    </div>
                    <div className="subscription-detail-item">
                      <span className="subscription-detail-label">Start date</span>
                      <span className="subscription-detail-value">
                        {formatUnixDate(subscription.startedAt)}
                      </span>
                    </div>
                    <div className="subscription-detail-item">
                      <span className="subscription-detail-label">Scheduled date</span>
                      <span className="subscription-detail-value">
                        {formatUnixDate(subscription.scheduledChangeAt)}
                      </span>
                    </div>
                    <div className="subscription-detail-item">
                      <span className="subscription-detail-label">Billing amount</span>
                      <span className="subscription-detail-value">
                        {formatPrice(subscription.pendingPlan.priceMonthly)}/month
                      </span>
                    </div>
                  </div>
                  {canCancelScheduledChange && (
                    <div className="subscription-section-action">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={cancelPendingMutation.isPending}
                        onClick={() => setCancelScheduledModalOpen(true)}
                      >
                        Cancel Scheduled Change
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {cancelModalOpen && subscription && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-subscription-title"
          onClick={() => !cancelMutation.isPending && setCancelModalOpen(false)}
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
                onClick={() => setCancelModalOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="modal-body-text">
              Your {subscription.plan.name} subscription will end at the close of
              the current billing period. You will not be charged again.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={cancelMutation.isPending}
                onClick={() => setCancelModalOpen(false)}
              >
                Keep subscription
              </button>
              <button
                type="button"
                className={`btn-danger-outline${cancelMutation.isPending ? " is-loading" : ""}`}
                disabled={cancelMutation.isPending}
                aria-busy={cancelMutation.isPending}
                onClick={() =>
                  cancelMutation.mutate(undefined, {
                    onSuccess: () => setCancelModalOpen(false),
                  })
                }
              >
                Cancel subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelScheduledModalOpen && subscription && (
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
              <h2 id="cancel-scheduled-title">Cancel scheduled change?</h2>
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
                  Your {subscription.plan.name} subscription will stay active.
                  Billing will continue as usual.
                </>
              ) : (
                <>
                  The scheduled change to {subscription.pendingPlan?.name} will be
                  canceled. You will stay on {subscription.plan.name}.
                </>
              )}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={cancelPendingMutation.isPending}
                onClick={() => setCancelScheduledModalOpen(false)}
              >
                Keep schedule
              </button>
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
                Cancel schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {!isLoading && plans && (
        <div className="plans-grid">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentSlug={subscription?.plan.slug}
              scheduledPlanSlug={
                hasScheduledChange ? subscription?.pendingPlan?.slug : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
