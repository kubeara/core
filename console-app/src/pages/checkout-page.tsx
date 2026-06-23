import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { getErrorMessage } from "@/api/api-error";
import { KubearaLogo } from "@/components/shared/kubeara-logo";
import { ProfilePageSkeleton } from "@/components/shared/skeleton";
import { useAuth } from "@/features/auth/context/use-auth";
import {
  formatPrice,
  useCheckoutSetupQuery,
} from "@/features/subscriptions/hooks";
import type { PlanSlug } from "@/features/subscriptions/types";
import "@/features/subscriptions/checkout-ui.css";

const VALID_SLUGS: PlanSlug[] = ["starter", "pro", "business"];

function CheckoutPaymentForm({
  email,
  name,
  planSlug,
}: {
  email: string;
  name: string;
  planSlug: PlanSlug;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setError(null);
    setIsSubmitting(true);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Please check your payment details");
      setIsSubmitting(false);
      return;
    }

    const returnUrl = `${window.location.origin}/subscription?checkout=success&plan=${planSlug}`;

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: returnUrl,
        receipt_email: email,
        payment_method_data: {
          billing_details: { email, name },
        },
      },
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setIsSubmitting(false);
      return;
    }

    navigate(`/subscription?checkout=success&plan=${planSlug}`, { replace: true });
  }

  return (
    <form onSubmit={handleSubmit} className="checkout-form">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <p className="checkout-error" role="alert">
          {error}
        </p>
      )}
      <div className="checkout-form-actions">
        <button
          type="submit"
          className="checkout-submit"
          disabled={!stripe || !elements || isSubmitting}
        >
          {isSubmitting ? "Processing…" : "Subscribe"}
        </button>
        <Link to="/plans?checkout=canceled" className="checkout-cancel-link">
          Cancel and return to plans
        </Link>
      </div>
    </form>
  );
}

export function CheckoutPage() {
  const { user } = useAuth();
  const { planSlug } = useParams<{ planSlug: PlanSlug }>();

  if (!planSlug || !VALID_SLUGS.includes(planSlug)) {
    return <Navigate to="/plans" replace />;
  }

  const { data, isPending, isError, error } = useCheckoutSetupQuery(planSlug);

  const stripePromise = useMemo(
    () => (data?.publishableKey ? loadStripe(data.publishableKey) : null),
    [data?.publishableKey],
  );

  const elementsOptions = useMemo<StripeElementsOptions | undefined>(() => {
    if (!data?.clientSecret) return undefined;
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    return {
      clientSecret: data.clientSecret,
      appearance: {
        theme: isDark ? "night" : "stripe",
        variables: {
          colorPrimary: isDark ? "#3b82f6" : "#2563eb",
          borderRadius: "8px",
          fontFamily: "Geist Sans, system-ui, sans-serif",
        },
      },
    };
  }, [data?.clientSecret]);

  if (isPending) {
    return (
      <div className="checkout-page">
        <ProfilePageSkeleton />
      </div>
    );
  }

  if (isError || !data || !stripePromise || !elementsOptions || !user) {
    return (
      <div className="checkout-page">
        <div className="profile-section-card">
          <p className="form-field-error">
            {isError ? getErrorMessage(error) : "Unable to start checkout"}
          </p>
          <Link to="/plans" className="btn-secondary" style={{ marginTop: "1rem" }}>
            Back to plans
          </Link>
        </div>
      </div>
    );
  }

  const { plan } = data;

  return (
    <div className="checkout-page">
      <div className="checkout-layout">
        <aside className="checkout-summary">
          <div className="checkout-summary-brand">
            <KubearaLogo />
            <span>Kubeara</span>
          </div>
          <h1>Subscribe to {plan.name}</h1>
          <div className="checkout-line-item">
            <span>{plan.name}</span>
            <span>
              {formatPrice(plan.priceMonthly)}
              <span className="checkout-line-item-interval">/month</span>
            </span>
          </div>
          <div className="checkout-total">
            <span>Total due today</span>
            <span>{formatPrice(plan.priceMonthly)}</span>
          </div>
        </aside>

        <section className="checkout-form-panel">
          <Elements stripe={stripePromise} options={elementsOptions}>
            <CheckoutPaymentForm
              email={user.email}
              name={user.name}
              planSlug={planSlug}
            />
          </Elements>
        </section>
      </div>
    </div>
  );
}
