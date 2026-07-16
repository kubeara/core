import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { BackLink } from "@/components/shared/back-link";
import { SkeletonGrid } from "@/components/shared/skeleton";
import {
  formatBillingInterval,
  formatPrice,
  formatUnixDate,
  getPlanAction,
  getPlanBillingDisplay,
  setCurrentSubscriptionCache,
  useCancelPendingDowngradeMutation,
  useCancelSubscriptionMutation,
  useChangePlanMutation,
  useCurrentSubscriptionQuery,
  usePlansQuery,
} from "@/features/subscriptions/hooks";
import { confirmCheckoutPayment } from "@/features/subscriptions/api";
import { showSuccessToast } from "@/lib/toast";
import type { BillingCycleSlug, Plan, PlanSlug } from "@/features/subscriptions/types";
import { getPlanTierSlug, PLAN_TIER_ORDER } from "@/features/subscriptions/plan-slug.util";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/query-keys";
import "@/features/subscriptions/subscriptions-ui.css";

type SubscriptionTab = "current" | "schedules" | "card";

function formatCardBrand(brand: string): string {
  if (brand === "amex") return "American Express";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

const CHECKOUT_PLAN_SLUGS: PlanSlug[] = [
  "starter-monthly",
  "starter-quarterly",
  "starter-yearly",
  "pro-monthly",
  "pro-quarterly",
  "pro-yearly",
  "max-monthly",
  "max-quarterly",
  "max-yearly",
];

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
    if (plan.tierSlug === "enterprise") {
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

  const isEnterprise = plan.tierSlug === "enterprise";
  const billingPrice = getPlanBillingDisplay(plan);
  const currentIdx = PLAN_TIER_ORDER.indexOf(getPlanTierSlug(currentSlug ?? "free"));
  const proIdx = PLAN_TIER_ORDER.indexOf("pro");
  const isPopular =
    plan.tierSlug === "pro" && currentIdx < proIdx && action !== "current";
  const isScheduledTarget = scheduledPlanSlug === plan.slug;
  const ctaLabel = isEnterprise
    ? "Contact Support"
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
              {formatPrice(billingPrice.display)}
              {billingPrice.hasDiscount && (
                <span className="plan-card-price-original">
                  {formatPrice(billingPrice.original)}
                </span>
              )}
              <span>{formatBillingInterval(plan.billingCycle)}</span>
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
    data: plansData,
    isPending: plansPending,
    isError: plansError,
    error: plansErr,
  } = usePlansQuery();
  const { data: subscription, isPending: subPending } =
    useCurrentSubscriptionQuery();
  const [billingCycle, setBillingCycle] = useState<BillingCycleSlug>("yearly");
  const billingCycleSynced = useRef(false);
  const plans = plansData?.plans?.filter(
    (plan) => plan.billingCycle === billingCycle,
  );
  const billingCycles = plansData?.billingCycles ?? [];

  useEffect(() => {
    if (billingCycleSynced.current || !subscription) return;
    const cycle = subscription.billingCycle ?? subscription.plan.billingCycle;
    if (cycle) setBillingCycle(cycle);
    billingCycleSynced.current = true;
  }, [subscription]);
  const cancelMutation = useCancelSubscriptionMutation();
  const cancelPendingMutation = useCancelPendingDowngradeMutation();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelScheduledModalOpen, setCancelScheduledModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [subscriptionTab, setSubscriptionTab] =
    useState<SubscriptionTab>("current");
  const [isCompletingCheckout, setIsCompletingCheckout] = useState(
    () => searchParams.get("checkout") === "success",
  );

  const isLoading = plansPending || subPending || isCompletingCheckout;
  const hasScheduledChange =
    subscription?.pendingDowngradeStatus === "scheduled" &&
    !!subscription?.pendingPlan;
  const isCancelScheduled = subscription?.pendingPlan?.slug === "free";
  const isFree = subscription?.plan.slug === "free";
  const hasPaymentCard =
    !isFree || !!subscription?.paymentMethod;
  const canCancel =
    !isFree &&
    subscription?.subscriptionStatus === "active" &&
    !hasScheduledChange;
  const canCancelScheduledChange = hasScheduledChange;

  useEffect(() => {
    if (!cancelModalOpen && !cancelScheduledModalOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (cancelMutation.isPending || cancelPendingMutation.isPending) return;
      if (cancelModalOpen) setCancelModalOpen(false);
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
      .then(async ({ subscription, message }) => {
        if (cancelled) return;
        setCurrentSubscriptionCache(queryClient, subscription);
        await queryClient.refetchQueries({
          queryKey: QUERY_KEYS.subscriptions.current,
        });
        showSuccessToast(message);
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

  useEffect(() => {
    if (!hasScheduledChange && subscriptionTab === "schedules") {
      setSubscriptionTab("current");
    }
    if (!hasPaymentCard && subscriptionTab === "card") {
      setSubscriptionTab("current");
    }
  }, [hasScheduledChange, hasPaymentCard, subscriptionTab]);

  const subscriptionTabs: Array<{ id: SubscriptionTab; label: string }> = [
    { id: "current", label: "Current subscription" },
    ...(hasScheduledChange
      ? [{ id: "schedules" as SubscriptionTab, label: "Schedule changes" }]
      : []),
    ...(hasPaymentCard
      ? [{ id: "card" as SubscriptionTab, label: "Payment card" }]
      : []),
  ];
  const showSubscriptionTabs = subscriptionTabs.length > 1;
  const activeSubscriptionTab = showSubscriptionTabs
    ? subscriptionTab
    : "current";

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
            {showSubscriptionTabs && (
              <div className="subscription-tabs-row">
                <div
                  className="subscription-tabs"
                  role="tablist"
                  aria-label="Subscription details"
                >
                  {subscriptionTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeSubscriptionTab === tab.id}
                      className={`subscription-tab${activeSubscriptionTab === tab.id ? " is-active" : ""}`}
                      onClick={() => setSubscriptionTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {activeSubscriptionTab === "current" && canCancel && (
                  <div className="subscription-tabs-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-danger-outline"
                      disabled={cancelMutation.isPending}
                      onClick={() => {
                        setCancelReason("");
                        setCancelModalOpen(true);
                      }}
                    >
                      Cancel Subscription
                    </button>
                  </div>
                )}
                {activeSubscriptionTab === "schedules" && canCancelScheduledChange && (
                  <div className="subscription-tabs-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={cancelPendingMutation.isPending}
                      onClick={() => setCancelScheduledModalOpen(true)}
                    >
                      Discard scheduled change
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeSubscriptionTab === "current" && (
              <div className="subscription-block">
                <div className="subscription-section-header">
                  <h2>Current subscription</h2>
                  <p className="profile-section-desc">
                    {subscription.plan.name} —{" "}
                    {formatPrice(subscription.billingAmount)}
                    {formatBillingInterval(subscription.billingCycle)}
                    {subscription.promoCode &&
                      subscription.billingDiscountAmount > 0 && (
                        <span className="subscription-promo-badge">
                          {" "}
                          ({subscription.promoCode})
                        </span>
                      )}
                  </p>
                </div>
                <div className="subscription-details-grid">
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
                          {formatPrice(
                            subscription.billingListAmount ??
                              subscription.billingAmount,
                          )}
                          {formatBillingInterval(subscription.billingCycle)}
                        </span>
                      </div>
                      <div className="subscription-detail-item">
                        <span className="subscription-detail-label">
                          Promo discount
                        </span>
                        <span className="subscription-detail-value subscription-promo-discount">
                          -{formatPrice(subscription.billingDiscountAmount)}
                          {subscription.promoCode
                            ? ` (${subscription.promoCode})`
                            : ""}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="subscription-detail-item">
                    <span className="subscription-detail-label">
                      {subscription.billingDiscountAmount > 0
                        ? "Amount paid"
                        : "Billing amount"}
                    </span>
                    <span className="subscription-detail-value">
                      {formatPrice(subscription.billingAmount)}
                      {formatBillingInterval(subscription.billingCycle)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeSubscriptionTab === "schedules" && (
              <div className="subscription-block">
                <div className="subscription-section-header">
                  <h2>Schedules</h2>
                  {hasScheduledChange && subscription.pendingPlan && (
                    isCancelScheduled ? (
                      <p className="profile-section-desc subscription-notice">
                        Your subscription is canceled on{" "}
                        {formatUnixDate(subscription.scheduledChangeAt)}.
                      </p>
                    ) : (
                      <p className="profile-section-desc">
                        {subscription.pendingPlan.name} —{" "}
                        {formatPrice(subscription.pendingPlan.price)}
                        {formatBillingInterval(subscription.pendingPlan.billingCycle)}
                      </p>
                    )
                  )}
                </div>
                {hasScheduledChange && subscription.pendingPlan ? (
                  <>
                    <div className="subscription-details-grid">
                      <div className="subscription-detail-item">
                        <span className="subscription-detail-label">
                          Scheduled on
                        </span>
                        <span className="subscription-detail-value">
                          {formatUnixDate(subscription.scheduledChangeAt)}
                        </span>
                      </div>
                      <div className="subscription-detail-item">
                        <span className="subscription-detail-label">Plan</span>
                        <span className="subscription-detail-value">
                          {subscription.pendingPlan.name}
                        </span>
                      </div>
                      <div className="subscription-detail-item">
                        <span className="subscription-detail-label">
                          Billing amount
                        </span>
                        <span className="subscription-detail-value">
                          {formatPrice(subscription.pendingPlan.price)}
                          {formatBillingInterval(
                            subscription.pendingPlan.billingCycle,
                          )}
                        </span>
                      </div>
                      <div className="subscription-detail-item">
                        <span className="subscription-detail-label">Type</span>
                        <span className="subscription-detail-value">
                          {isCancelScheduled ? "Cancellation" : "Downgrade"}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="profile-section-desc subscription-notice">
                    No scheduled changes.
                  </p>
                )}
              </div>
            )}

            {activeSubscriptionTab === "card" && (
              <div className="subscription-block">
                <div className="subscription-section-header">
                  <h2>Payment card</h2>
                </div>
                {subscription.paymentMethod ? (
                  <div className="subscription-details-grid">
                    <div className="subscription-detail-item">
                      <span className="subscription-detail-label">Card number</span>
                      <span className="subscription-detail-value">
                        •••• •••• •••• {subscription.paymentMethod.last4}
                      </span>
                    </div>
                    <div className="subscription-detail-item">
                      <span className="subscription-detail-label">Expiry</span>
                      <span className="subscription-detail-value">
                        {String(subscription.paymentMethod.expMonth).padStart(
                          2,
                          "0",
                        )}
                        /{String(subscription.paymentMethod.expYear).slice(-2)}
                      </span>
                    </div>
                    <div className="subscription-detail-item">
                      <span className="subscription-detail-label">Brand</span>
                      <span className="subscription-detail-value">
                        {formatCardBrand(subscription.paymentMethod.brand)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="profile-section-desc subscription-notice">
                    No payment card on file.
                  </p>
                )}
              </div>
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

      {!isLoading && plans && (
        <>
          <div
            className="plans-billing-toggle"
            role="tablist"
            aria-label="Billing cycle"
          >
            {billingCycles.map((cycle) => (
              <button
                key={cycle.slug}
                type="button"
                role="tab"
                aria-selected={billingCycle === cycle.slug}
                className={`plans-billing-option${billingCycle === cycle.slug ? " is-active" : ""}`}
                onClick={() => setBillingCycle(cycle.slug)}
              >
                {cycle.label}
                {cycle.badge && (
                  <span className="plans-billing-badge">{cycle.badge}</span>
                )}
              </button>
            ))}
          </div>
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
        </>
      )}
    </div>
  );
}
