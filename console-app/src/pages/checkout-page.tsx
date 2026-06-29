import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "@/api/api-error";
import { QUERY_KEYS } from "@/constants/query-keys";
import { showSuccessToast } from "@/lib/toast";
import { KubearaLogo } from "@/components/shared/kubeara-logo";
import { ProfilePageSkeleton } from "@/components/shared/skeleton";
import { useAuth } from "@/features/auth/context/use-auth";
import {
  confirmCheckoutPayment,
  createCheckoutPayment,
  getPlanBillingDisplay,
} from "@/features/subscriptions/api";
import {
  formatBillingInterval,
  formatPrice,
  setCurrentSubscriptionCache,
  useCheckoutSetupQuery,
} from "@/features/subscriptions/hooks";
import type {
  BillingCycleSlug,
  CheckoutPaymentMethod,
  CheckoutResponse,
  PlanSlug,
} from "@/features/subscriptions/types";
import "@/features/subscriptions/checkout-ui.css";
import "@/features/subscriptions/subscriptions-ui.css";

import { isPaidPlanSlug } from "@/features/subscriptions/plan-slug.util";

function formatCardBrand(brand: string): string {
  if (brand === "amex") return "American Express";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function SavedPaymentMethodPreview({
  paymentMethod,
  dueToday,
}: {
  paymentMethod?: CheckoutPaymentMethod | null;
  dueToday: number;
}) {
  if (!paymentMethod) {
    return (
      <div className="checkout-saved-payment">
        <p className="checkout-saved-payment-label">Payment method</p>
        <div className="checkout-saved-payment-card" aria-disabled="true">
          <div className="checkout-saved-payment-row">
            <span className="checkout-saved-payment-field-label">Card number</span>
            <span className="checkout-saved-payment-field-value">
              •••• •••• •••• ••••
            </span>
          </div>
          <div className="checkout-saved-payment-row checkout-saved-payment-row-split">
            <div>
              <span className="checkout-saved-payment-field-label">Expiry</span>
              <span className="checkout-saved-payment-field-value">••/••</span>
            </div>
            <div>
              <span className="checkout-saved-payment-field-label">CVC</span>
              <span className="checkout-saved-payment-field-value">•••</span>
            </div>
          </div>
        </div>
        <p className="checkout-saved-payment-note">
          Your saved card on file will be charged{" "}
          {formatPrice(dueToday)} today.
        </p>
      </div>
    );
  }

  const brand = formatCardBrand(paymentMethod.brand);
  const exp = `${String(paymentMethod.expMonth).padStart(2, "0")}/${String(paymentMethod.expYear).slice(-2)}`;

  return (
    <div className="checkout-saved-payment">
      <p className="checkout-saved-payment-label">Payment method</p>
      <div className="checkout-saved-payment-card" aria-disabled="true">
        <div className="checkout-saved-payment-row">
          <span className="checkout-saved-payment-field-label">Card number</span>
          <span className="checkout-saved-payment-field-value">
            •••• •••• •••• {paymentMethod.last4}
          </span>
        </div>
        <div className="checkout-saved-payment-row checkout-saved-payment-row-split">
          <div>
            <span className="checkout-saved-payment-field-label">Expiry</span>
            <span className="checkout-saved-payment-field-value">{exp}</span>
          </div>
          <div>
            <span className="checkout-saved-payment-field-label">Brand</span>
            <span className="checkout-saved-payment-field-value">{brand}</span>
          </div>
        </div>
      </div>
      <p className="checkout-saved-payment-note">
        {brand} ending in {paymentMethod.last4} will be charged{" "}
        {formatPrice(dueToday)} today.
      </p>
    </div>
  );
}

function checkoutBillingDefaults(user: {
  email: string;
  name: string;
}): { email: string; name?: string } {
  const name = user.name.trim();
  return {
    email: user.email,
    ...(name ? { name } : {}),
  };
}

function CheckoutPaymentForm({
  email,
  name,
  planSlug,
  billingCycle,
}: {
  email: string;
  name: string;
  planSlug: PlanSlug;
  billingCycle: BillingCycleSlug;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

    const returnUrl = `${window.location.origin}/plans?checkout=success&plan=${planSlug}`;

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

    try {
      const { subscription, message } = await confirmCheckoutPayment({
        planSlug,
        billingCycle,
      });
      setCurrentSubscriptionCache(queryClient, subscription);
      await queryClient.refetchQueries({
        queryKey: QUERY_KEYS.subscriptions.current,
      });
      showSuccessToast(message);
      navigate("/plans", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="checkout-form">
      <PaymentElement
        options={{
          layout: "tabs",
          defaultValues: {
            billingDetails: checkoutBillingDefaults({ email, name }),
          },
        }}
      />
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { planSlug } = useParams<{ planSlug: PlanSlug }>();
  const [paymentSetup, setPaymentSetup] = useState<CheckoutResponse | null>(
    null,
  );
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [startPaymentError, setStartPaymentError] = useState<string | null>(
    null,
  );

  if (!planSlug || !isPaidPlanSlug(planSlug)) {
    return <Navigate to="/plans" replace />;
  }

  const billingCycle = planSlug.endsWith("-yearly")
    ? "yearly"
    : planSlug.endsWith("-quarterly")
      ? "quarterly"
      : "monthly";

  const { data: preview, isPending, isFetching, isError, error, refetch } =
    useCheckoutSetupQuery(planSlug, billingCycle);

  const data = paymentSetup ?? preview;

  const needsProceed =
    Boolean(data?.proratedUpgrade) &&
    !data?.clientSecret &&
    !data?.immediate;

  const [isConfirmingImmediate, setIsConfirmingImmediate] = useState(false);

  useEffect(() => {
    if (!data?.immediate || !planSlug || paymentSetup || isConfirmingImmediate) {
      return;
    }

    setIsConfirmingImmediate(true);

    confirmCheckoutPayment({ planSlug, billingCycle })
      .then(async ({ subscription, message }) => {
        setCurrentSubscriptionCache(queryClient, subscription);
        await queryClient.refetchQueries({
          queryKey: QUERY_KEYS.subscriptions.current,
        });
        showSuccessToast(message);
        navigate("/plans", { replace: true });
      })
      .catch((err) => {
        setStartPaymentError(getErrorMessage(err));
      })
      .finally(() => {
        setIsConfirmingImmediate(false);
      });
  }, [
    data?.immediate,
    isConfirmingImmediate,
    navigate,
    paymentSetup,
    planSlug,
    billingCycle,
  ]);

  const stripePromise = useMemo(
    () => (data?.publishableKey ? loadStripe(data.publishableKey) : null),
    [data?.publishableKey],
  );

  const elementsOptions = useMemo<StripeElementsOptions | undefined>(() => {
    if (!data?.clientSecret || !user) return undefined;
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
      defaultValues: {
        billingDetails: checkoutBillingDefaults({
          email: user.email,
          name: user.name,
        }),
      },
    };
  }, [data?.clientSecret, user]);

  async function handleProceed() {
    if (!planSlug) return;

    setStartPaymentError(null);
    setIsStartingPayment(true);

    try {
      const result = await createCheckoutPayment({
        planSlug,
        billingCycle,
        startPayment: true,
      });

      if (result.immediate) {
        if (result.subscription) {
          setCurrentSubscriptionCache(queryClient, result.subscription);
          showSuccessToast("Subscription confirmed successfully");
          navigate("/plans", { replace: true });
          return;
        }

        const { subscription, message } = await confirmCheckoutPayment({
          planSlug,
          billingCycle,
        });
        setCurrentSubscriptionCache(queryClient, subscription);
        showSuccessToast(message);
        navigate("/plans", { replace: true });
        return;
      }

      if (
        result.proratedUpgrade &&
        result.clientSecret &&
        result.publishableKey
      ) {
        const stripe = await loadStripe(result.publishableKey);
        if (stripe) {
          const { error: confirmError } = await stripe.confirmPayment({
            clientSecret: result.clientSecret,
            confirmParams: {
              return_url: `${window.location.origin}/plans?checkout=success&plan=${planSlug}`,
            },
            redirect: "if_required",
          });
          if (confirmError) {
            setStartPaymentError(
              confirmError.message ?? "Payment confirmation failed",
            );
            return;
          }
          const { subscription, message } = await confirmCheckoutPayment({
            planSlug,
            billingCycle,
          });
          setCurrentSubscriptionCache(queryClient, subscription);
          showSuccessToast(message);
          navigate("/plans", { replace: true });
          return;
        }
      }

      if (result.proratedUpgrade && result.clientSecret) {
        setStartPaymentError(
          "Unable to confirm payment. Please try again in a moment.",
        );
        return;
      }

      setPaymentSetup(result);
    } catch (err) {
      setStartPaymentError(getErrorMessage(err));
    } finally {
      setIsStartingPayment(false);
    }
  }

  if ((isPending || isFetching || isConfirmingImmediate) && !paymentSetup) {
    return (
      <div className="checkout-page">
        <ProfilePageSkeleton />
      </div>
    );
  }

  const canCollectPayment =
    needsProceed ||
    Boolean(data?.immediate) ||
    Boolean(elementsOptions && stripePromise);

  if (
    isError ||
    !data ||
    !user ||
    !canCollectPayment
  ) {
    return (
      <div className="checkout-page">
        <div className="profile-section-card">
          <p className="form-field-error">
            {startPaymentError ??
              (isError ? getErrorMessage(error) : "Unable to start checkout")}
          </p>
          {!isError && !data && (
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: "1rem" }}
              onClick={() => void refetch()}
            >
              Try again
            </button>
          )}
          <Link to="/plans" className="btn-secondary" style={{ marginTop: "1rem" }}>
            Back to plans
          </Link>
        </div>
      </div>
    );
  }

  if (data.immediate) {
    return (
      <div className="checkout-page">
        <ProfilePageSkeleton />
      </div>
    );
  }

  const { plan } = data;
  const billingPrice = getPlanBillingDisplay(plan);
  const dueToday = data.proratedUpgrade
    ? data.amountDue ?? 0
    : billingPrice.display;

  return (
    <div className="checkout-page">
      <div className="checkout-layout">
        <aside className="checkout-summary">
          <div className="checkout-summary-brand">
            <KubearaLogo />
            {/* <span>Kubeara</span> */}
          </div>
          <div className="checkout-summary-headline">
            <span>Continue to {plan.name}</span>
            <span>
              {formatPrice(billingPrice.display)}
              {billingPrice.hasDiscount && (
                <span className="plan-card-price-original">
                  {formatPrice(billingPrice.original)}
                </span>
              )}
              <span className="checkout-line-item-interval">
                {formatBillingInterval(plan.billingCycle)}
              </span>
            </span>
          </div>
          {/* {data.proratedUpgrade && (
            <div className="checkout-pricing">
              <div className="checkout-pricing-row checkout-pricing-total">
                <span>Total due today</span>
                <span>{formatPrice(dueToday)}</span>
              </div>
            </div>
          )} */}
          <p className="checkout-features-label">Features</p>
          <ul className="checkout-features">
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
        </aside>

        <section className="checkout-form-panel">
          {needsProceed ? (
            <div className="checkout-form">
              <SavedPaymentMethodPreview
                paymentMethod={data.paymentMethod}
                dueToday={dueToday}
              />
              {startPaymentError && (
                <p className="checkout-error" role="alert">
                  {startPaymentError}
                </p>
              )}
              <div className="checkout-form-actions">
                <button
                  type="button"
                  className="checkout-submit 2"
                  disabled={isStartingPayment}
                  onClick={() => void handleProceed()}
                >
                  {isStartingPayment
                    ? "Processing…"
                    : `Pay ${formatPrice(dueToday)}`}
                </button>
                <Link
                  to="/plans?checkout=canceled"
                  className="checkout-cancel-link"
                >
                  Cancel and return to plans
                </Link>
              </div>
            </div>
          ) : (
            stripePromise &&
            elementsOptions && (
              <Elements stripe={stripePromise} options={elementsOptions}>
                <CheckoutPaymentForm
                  email={user.email}
                  name={user.name}
                  planSlug={planSlug}
                  billingCycle={billingCycle}
                />
              </Elements>
            )
          )}
        </section>
      </div>
    </div>
  );
}
