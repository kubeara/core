import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { BackLink } from "@/components/shared/back-link";
import { SkeletonGrid } from "@/components/shared/skeleton";
import {
  formatPrice,
  getPlanAction,
  useChangePlanMutation,
  useCurrentSubscriptionQuery,
  usePlansQuery,
} from "@/features/subscriptions/hooks";
import type { Plan, PlanSlug } from "@/features/subscriptions/types";
import "@/features/subscriptions/subscriptions-ui.css";

function PlanCard({
  plan,
  currentSlug,
}: {
  plan: Plan;
  currentSlug: PlanSlug | undefined;
}) {
  const navigate = useNavigate();
  const changePlanMutation = useChangePlanMutation();
  const action = getPlanAction(currentSlug, plan.slug);
  const isPending = changePlanMutation.isPending;

  function handleAction() {
    if (action === "upgrade") {
      navigate(`/checkout/${plan.slug}`);
      return;
    }
    if (action === "downgrade") {
      changePlanMutation.mutate({ planSlug: plan.slug });
    }
  }

  return (
    <article
      className={`plan-card${action === "current" ? " is-current" : ""}`}
    >
      {action === "current" && (
        <span className="plan-card-badge">Current plan</span>
      )}
      <div className="plan-card-header">
        <h3>{plan.name}</h3>
        <p className="plan-card-price">
          {formatPrice(plan.priceMonthly)}
          <span>/month</span>
        </p>
      </div>
      {plan.description && (
        <p className="plan-card-desc">{plan.description}</p>
      )}
      <ul className="plan-card-features">
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <div className="plan-card-actions">
        {action === "current" ? (
          <button type="button" className="btn-secondary" disabled>
            Current plan
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={isPending}
            onClick={handleAction}
          >
            {isPending
              ? "Processing…"
              : action === "upgrade"
                ? "Upgrade"
                : "Downgrade"}
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

  return (
    <div className="profile-page">
      <BackLink to="/subscription" label="Back to subscription" />

      <header className="dashboard-header">
        <div>
          <h1>Plans</h1>
          <p>Choose the plan that fits your needs.</p>
        </div>
      </header>

      {isLoading && <SkeletonGrid count={4} label="Loading plans…" />}

      {plansError && (
        <div className="profile-section-card">
          <p className="form-field-error">{getErrorMessage(plansErr)}</p>
        </div>
      )}

      {!isLoading && plans && (
        <div className="plans-grid">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentSlug={subscription?.plan.slug}
            />
          ))}
        </div>
      )}
    </div>
  );
}
