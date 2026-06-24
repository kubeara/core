import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { BackLink } from "@/components/shared/back-link";
import { SkeletonGrid } from "@/components/shared/skeleton";
import {
  formatPrice,
  formatUnixDate,
  getPlanAction,
  useChangePlanMutation,
  useCurrentSubscriptionQuery,
  usePlansQuery,
} from "@/features/subscriptions/hooks";
import type { Plan, PlanSlug } from "@/features/subscriptions/types";
import "@/features/subscriptions/subscriptions-ui.css";

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
  const {
    data: plans,
    isPending: plansPending,
    isError: plansError,
    error: plansErr,
  } = usePlansQuery();
  const { data: subscription, isPending: subPending } =
    useCurrentSubscriptionQuery();

  const isLoading = plansPending || subPending;
  const hasScheduledChange =
    subscription?.pendingDowngradeStatus === "scheduled" &&
    !!subscription?.pendingPlan;
  const isCancelScheduled = subscription?.pendingPlan?.slug === "free";

  return (
    <div className="profile-page">
      <BackLink to="/subscription" label="Back to subscription" />

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

      {!isLoading && hasScheduledChange && subscription.pendingPlan && (
        <div className="profile-page-body">
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
