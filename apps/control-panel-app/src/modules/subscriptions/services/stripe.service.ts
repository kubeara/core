import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PlanSlug } from "../enums/plan-slug.enum";
import { BillingCycleSlug } from "../enums/billing-cycle.enum";
import { CheckoutPricing } from "../interfaces/checkout-pricing.interface";
import { SubscriptionBillingDetails } from "../interfaces/subscription-billing.interface";

type StripeSubscription = Stripe.Subscription;
type CheckoutPaymentMethodType =
  "card" | "customer_balance" | "paypal" | "sepa_debit" | "us_bank_account";

@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const secretKey = this.configService
      .get<string>("STRIPE_SECRET_KEY")
      ?.trim();
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    } else {
      this.logger.warn("STRIPE_SECRET_KEY not set; Stripe features disabled");
    }
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  getClient(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException("Stripe is not configured");
    }
    return this.stripe;
  }

  private getCheckoutPaymentMethodTypes(): CheckoutPaymentMethodType[] {
    const allowed: CheckoutPaymentMethodType[] = [
      "card",
      "customer_balance",
      "paypal",
      "sepa_debit",
      "us_bank_account",
    ];
    const configured = this.configService
      .get<string>("STRIPE_CHECKOUT_PAYMENT_METHODS")
      ?.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is CheckoutPaymentMethodType =>
        allowed.includes(value as CheckoutPaymentMethodType),
      );

    const methods: CheckoutPaymentMethodType[] = configured?.length
      ? [...new Set(configured)]
      : ["card"];
    return methods.includes("card") ? methods : ["card", ...methods];
  }

  private isPaymentMethodConfigError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    const message =
      (error as Stripe.errors.StripeError).message?.toLowerCase() ?? "";
    return (
      message.includes("payment method type") ||
      message.includes("payment_method_types")
    );
  }

  private extractInvalidPaymentMethodType(
    error: unknown,
  ): CheckoutPaymentMethodType | null {
    if (!error || typeof error !== "object") {
      return null;
    }
    const message = (error as Stripe.errors.StripeError).message ?? "";
    const match = message.match(/payment method type [`']([^`']+)[`']/i);
    const value = match?.[1]?.trim().toLowerCase();
    if (!value) {
      return null;
    }
    const allowed: CheckoutPaymentMethodType[] = [
      "card",
      "customer_balance",
      "paypal",
      "sepa_debit",
      "us_bank_account",
    ];
    return allowed.includes(value as CheckoutPaymentMethodType)
      ? (value as CheckoutPaymentMethodType)
      : null;
  }

  private async runWithResolvedPaymentMethodTypes<T>(
    operation: (paymentMethodTypes: CheckoutPaymentMethodType[]) => Promise<T>,
  ): Promise<T> {
    let methods = this.getCheckoutPaymentMethodTypes();
    const maxAttempts = methods.length + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation(methods);
      } catch (error) {
        if (!this.isPaymentMethodConfigError(error)) {
          throw error;
        }

        const invalidMethod = this.extractInvalidPaymentMethodType(error);
        if (invalidMethod && methods.length > 1) {
          methods = methods.filter((method) => method !== invalidMethod);
          this.logger.warn(
            `Removing unsupported checkout payment method: ${invalidMethod}`,
          );
          continue;
        }

        if (methods.length !== 1 || methods[0] !== "card") {
          methods = ["card"];
          this.logger.warn(
            "Falling back checkout payment methods to card only",
          );
          continue;
        }

        throw error;
      }
    }

    throw new BadRequestException("Failed to resolve checkout payment methods");
  }

  private throwCheckoutStripeError(
    error: unknown,
    fallback = "Checkout failed",
  ): never {
    if (error instanceof BadRequestException) {
      throw error;
    }
    const message =
      (error as Stripe.errors.StripeError).message ??
      (error instanceof Error ? error.message : fallback);
    throw new BadRequestException(message);
  }

  async createCustomer(input: {
    email?: string;
    name?: string;
    organizationId: string;
  }): Promise<string | null> {
    if (!this.stripe) {
      return null;
    }

    const customer = await this.stripe.customers.create({
      ...(input.email ? { email: input.email } : {}),
      ...(input.name ? { name: input.name } : {}),
      metadata: { organizationId: input.organizationId },
    });

    return customer.id;
  }

  async updateCustomer(
    customerId: string,
    input: {
      email: string;
      name?: string;
    },
  ): Promise<void> {
    const stripe = this.getClient();
    await stripe.customers.update(customerId, {
      email: input.email,
      ...(input.name ? { name: input.name } : {}),
    });
  }

  async getCustomerPaymentMethodSummary(
    customerId: string,
    stripeSubscriptionId?: string | null,
  ): Promise<{
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null> {
    const stripe = this.getClient();

    const resolveCard = (
      paymentMethod: Stripe.PaymentMethod | string | null | undefined,
    ) => {
      if (!paymentMethod || typeof paymentMethod === "string") {
        return null;
      }
      if (paymentMethod.type !== "card" || !paymentMethod.card) {
        return null;
      }
      return {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expMonth: paymentMethod.card.exp_month,
        expYear: paymentMethod.card.exp_year,
      };
    };

    if (stripeSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(
        stripeSubscriptionId,
        { expand: ["default_payment_method"] },
      );
      const fromSubscription = resolveCard(subscription.default_payment_method);
      if (fromSubscription) {
        return fromSubscription;
      }
    }

    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });

    if (customer.deleted) {
      return null;
    }

    const fromCustomer = resolveCard(
      customer.invoice_settings?.default_payment_method,
    );
    if (fromCustomer) {
      return fromCustomer;
    }

    const methods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 1,
    });

    return resolveCard(methods.data[0] ?? null);
  }

  async resolvePromotionCode(code: string): Promise<{
    promotionCodeId: string;
    code: string;
    label: string;
  }> {
    const trimmed = code.trim();
    if (!trimmed) {
      throw new BadRequestException("Enter a promo code");
    }

    const stripe = this.getClient();
    const result = await stripe.promotionCodes.list({
      code: trimmed,
      active: true,
      limit: 1,
    });
    const promo = result.data[0];
    if (!promo) {
      throw new BadRequestException("Invalid or expired promo code");
    }

    const label = promo.code;

    return {
      promotionCodeId: promo.id,
      code: promo.code,
      label,
    };
  }

  private formatCheckoutPricing(
    subtotalCents: number,
    totalCents: number,
    promo?: { code: string; label: string },
    discountCents?: number,
  ): CheckoutPricing {
    const subtotal = subtotalCents / 100;
    const total = totalCents / 100;
    const discount =
      discountCents != null
        ? discountCents / 100
        : Math.max(0, subtotal - total);
    return {
      subtotal,
      discount,
      total,
      promoCode: promo?.code,
      promoLabel: promo?.label,
    };
  }

  private extractInvoicePricing(
    invoice: Stripe.Invoice,
    promo?: { code: string; label: string },
  ): CheckoutPricing {
    const subtotalCents = invoice.subtotal ?? 0;
    const amountDueCents = invoice.amount_due ?? invoice.total ?? 0;
    const discountCents = (invoice.total_discount_amounts ?? []).reduce(
      (sum, item) => sum + (item.amount ?? 0),
      0,
    );

    return this.formatCheckoutPricing(
      subtotalCents,
      amountDueCents,
      promo,
      discountCents,
    );
  }

  async resolveSubscriptionBilling(
    stripeSubscriptionId: string,
    planAmount: number,
  ): Promise<SubscriptionBillingDetails> {
    const stripe = this.getClient();
    const stripeSub = await stripe.subscriptions.retrieve(
      stripeSubscriptionId,
      {
        expand: ["discounts.promotion_code", "discounts.source.coupon"],
      },
    );

    const listAmount = planAmount;
    let promoCode: string | null = null;
    let stripePromotionCodeId: string | null = null;
    let discountAmount = 0;

    const metadataPromo = stripeSub.metadata?.promoCode?.trim();
    if (metadataPromo) {
      promoCode = metadataPromo;
    }
    const metadataPromoId = stripeSub.metadata?.stripePromotionCodeId?.trim();
    if (metadataPromoId) {
      stripePromotionCodeId = metadataPromoId;
    }

    const discountEntries = (stripeSub.discounts ?? []).filter(
      (entry): entry is Stripe.Discount =>
        typeof entry === "object" && entry !== null,
    );

    for (const entry of discountEntries) {
      const promotionCode = entry.promotion_code;
      if (typeof promotionCode === "object" && promotionCode?.code) {
        promoCode = promotionCode.code;
        stripePromotionCodeId = promotionCode.id;
      }

      const coupon = entry.source?.coupon;
      if (typeof coupon === "object" && coupon) {
        if (coupon.percent_off) {
          discountAmount = Math.max(
            discountAmount,
            listAmount * (coupon.percent_off / 100),
          );
        } else if (coupon.amount_off) {
          discountAmount = Math.max(discountAmount, coupon.amount_off / 100);
        }
      }
    }

    discountAmount = Math.min(discountAmount, listAmount);
    const billingAmount = Math.max(0, listAmount - discountAmount);

    return {
      listAmount,
      discountAmount,
      billingAmount,
      promoCode,
      stripePromotionCodeId,
    };
  }

  async previewSubscriptionPromo(input: {
    stripeSubscriptionId: string;
    promotionCodeId: string;
    promo?: { code: string; label: string };
  }): Promise<CheckoutPricing> {
    const stripe = this.getClient();
    try {
      const preview = await stripe.invoices.createPreview({
        subscription: input.stripeSubscriptionId,
        discounts: [{ promotion_code: input.promotionCodeId }],
      });

      return this.extractInvoicePricing(preview, input.promo);
    } catch (error) {
      this.throwCheckoutStripeError(error, "Failed to preview promo code");
    }
  }

  async previewNewSubscriptionCheckout(input: {
    customerId: string;
    priceId: string;
    promotionCodeId?: string;
    promo?: { code: string; label: string };
  }): Promise<CheckoutPricing> {
    const stripe = this.getClient();
    try {
      const preview = await stripe.invoices.createPreview({
        customer: input.customerId,
        subscription_details: {
          items: [{ price: input.priceId, quantity: 1 }],
        },
        ...(input.promotionCodeId
          ? { discounts: [{ promotion_code: input.promotionCodeId }] }
          : {}),
      });

      return this.extractInvoicePricing(preview, input.promo);
    } catch (error) {
      this.throwCheckoutStripeError(error, "Failed to preview checkout");
    }
  }

  async createSubscriptionPayment(input: {
    customerId: string;
    priceId: string;
    organizationId: string;
    planSlug: PlanSlug;
    billingCycle?: BillingCycleSlug;
    promotionCodeId?: string;
    promo?: { code: string; label: string };
  }): Promise<{
    clientSecret: string;
    subscriptionId: string;
    pricing: CheckoutPricing;
  }> {
    const stripe = this.getClient();
    const createParams: Stripe.SubscriptionCreateParams = {
      customer: input.customerId,
      items: [{ price: input.priceId }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.confirmation_secret"],
      metadata: {
        organizationId: input.organizationId,
        planSlug: input.planSlug,
        ...(input.billingCycle ? { billingCycle: input.billingCycle } : {}),
        ...(input.promo?.code ? { promoCode: input.promo.code } : {}),
        ...(input.promotionCodeId
          ? { stripePromotionCodeId: input.promotionCodeId }
          : {}),
      },
      ...(input.promotionCodeId
        ? { discounts: [{ promotion_code: input.promotionCodeId }] }
        : {}),
    };

    let subscription: Stripe.Subscription;
    try {
      subscription = await this.runWithResolvedPaymentMethodTypes(
        (paymentMethodTypes) =>
          stripe.subscriptions.create({
            ...createParams,
            payment_settings: {
              save_default_payment_method: "on_subscription",
              payment_method_types: paymentMethodTypes,
            },
          }),
      );
    } catch (error) {
      this.throwCheckoutStripeError(error, "Failed to create subscription");
    }

    const invoice = subscription.latest_invoice;
    if (!invoice || typeof invoice === "string") {
      throw new BadRequestException("Failed to create subscription invoice");
    }

    let resolvedInvoice = invoice;
    if (invoice.id) {
      resolvedInvoice = await stripe.invoices.retrieve(invoice.id, {
        expand: ["confirmation_secret", "total_discount_amounts"],
      });
    }

    const clientSecret = resolvedInvoice.confirmation_secret?.client_secret;
    if (!clientSecret) {
      throw new BadRequestException("Failed to create payment client secret");
    }

    return {
      clientSecret,
      subscriptionId: subscription.id,
      pricing: this.extractInvoicePricing(resolvedInvoice, input.promo),
    };
  }

  async applyPromotionToSubscription(input: {
    stripeSubscriptionId: string;
    promotionCodeId: string;
    promo: { code: string; label: string };
  }): Promise<{ clientSecret: string | null; pricing: CheckoutPricing }> {
    const stripe = this.getClient();
    try {
      const current = await stripe.subscriptions.retrieve(
        input.stripeSubscriptionId,
      );
      const updated = await stripe.subscriptions.update(
        input.stripeSubscriptionId,
        {
          discounts: [{ promotion_code: input.promotionCodeId }],
          metadata: {
            ...current.metadata,
            promoCode: input.promo.code,
            stripePromotionCodeId: input.promotionCodeId,
          },
          expand: ["latest_invoice.confirmation_secret"],
        },
      );

      let invoice = updated.latest_invoice;
      if (!invoice || typeof invoice === "string") {
        throw new BadRequestException("Failed to apply promo code");
      }

      if (invoice.id) {
        invoice = await stripe.invoices.retrieve(invoice.id, {
          expand: ["confirmation_secret", "total_discount_amounts"],
        });
      }

      const clientSecret = invoice.confirmation_secret?.client_secret ?? null;
      const pricing = this.extractInvoicePricing(invoice, input.promo);
      return {
        clientSecret,
        pricing,
      };
    } catch (error) {
      this.throwCheckoutStripeError(error, "Failed to apply promo code");
    }
  }

  async removePromotionFromSubscription(input: {
    stripeSubscriptionId: string;
  }): Promise<{ clientSecret: string | null; pricing: CheckoutPricing }> {
    const stripe = this.getClient();
    try {
      const current = await stripe.subscriptions.retrieve(
        input.stripeSubscriptionId,
      );
      const updated = await stripe.subscriptions.update(
        input.stripeSubscriptionId,
        {
          discounts: "",
          metadata: {
            ...current.metadata,
            promoCode: "",
            stripePromotionCodeId: "",
          },
          expand: ["latest_invoice.confirmation_secret"],
        },
      );

      let invoice = updated.latest_invoice;
      if (!invoice || typeof invoice === "string") {
        throw new BadRequestException("Failed to remove promo code");
      }

      if (invoice.id) {
        invoice = await stripe.invoices.retrieve(invoice.id, {
          expand: ["confirmation_secret", "total_discount_amounts"],
        });
      }

      const clientSecret = invoice.confirmation_secret?.client_secret ?? null;
      return {
        clientSecret,
        pricing: this.extractInvoicePricing(invoice),
      };
    } catch (error) {
      this.throwCheckoutStripeError(error, "Failed to remove promo code");
    }
  }

  async scheduleCancelAtPeriodEnd(
    stripeSubscriptionId: string,
    input: { organizationId: string; planSlug: PlanSlug },
  ): Promise<StripeSubscription> {
    const stripe = this.getClient();
    const subscription =
      await stripe.subscriptions.retrieve(stripeSubscriptionId);

    const metadata = {
      ...subscription.metadata,
      organizationId: input.organizationId,
      planSlug: subscription.metadata?.planSlug ?? input.planSlug,
      pendingPlanSlug: PlanSlug.FREE,
    };

    if (subscription.schedule) {
      const scheduleId =
        typeof subscription.schedule === "string"
          ? subscription.schedule
          : subscription.schedule.id;

      await stripe.subscriptionSchedules.update(scheduleId, {
        end_behavior: "cancel",
      });

      return stripe.subscriptions.update(stripeSubscriptionId, { metadata });
    }

    return stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
      metadata,
    });
  }

  async scheduleSubscriptionDowngrade(input: {
    stripeSubscriptionId: string;
    newPriceId: string;
    organizationId: string;
    currentPlanSlug: PlanSlug;
    pendingPlanSlug: PlanSlug;
  }): Promise<StripeSubscription> {
    const stripe = this.getClient();
    const subscription = await stripe.subscriptions.retrieve(
      input.stripeSubscriptionId,
    );
    const item = subscription.items.data[0];
    const currentPriceId =
      typeof item?.price === "string" ? item.price : item?.price?.id;

    if (!item?.id || !currentPriceId) {
      throw new BadRequestException("Subscription has no items");
    }

    if (subscription.schedule) {
      const scheduleId =
        typeof subscription.schedule === "string"
          ? subscription.schedule
          : subscription.schedule.id;
      const existingSchedule =
        await stripe.subscriptionSchedules.retrieve(scheduleId);

      await stripe.subscriptionSchedules.update(scheduleId, {
        end_behavior: "release",
        phases: [
          {
            items: [{ price: currentPriceId, quantity: 1 }],
            start_date: existingSchedule.phases[0].start_date,
            end_date: item.current_period_end,
          },
          {
            items: [{ price: input.newPriceId, quantity: 1 }],
            metadata: {
              organizationId: input.organizationId,
              planSlug: input.pendingPlanSlug,
            },
          },
        ],
      });

      return stripe.subscriptions.update(input.stripeSubscriptionId, {
        metadata: {
          ...subscription.metadata,
          organizationId: input.organizationId,
          planSlug: input.currentPlanSlug,
          pendingPlanSlug: input.pendingPlanSlug,
        },
      });
    }

    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: input.stripeSubscriptionId,
    });

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: currentPriceId, quantity: 1 }],
          start_date: schedule.phases[0].start_date,
          end_date: item.current_period_end,
        },
        {
          items: [{ price: input.newPriceId, quantity: 1 }],
          metadata: {
            organizationId: input.organizationId,
            planSlug: input.pendingPlanSlug,
          },
        },
      ],
    });

    return stripe.subscriptions.update(input.stripeSubscriptionId, {
      metadata: {
        ...subscription.metadata,
        organizationId: input.organizationId,
        planSlug: input.currentPlanSlug,
        pendingPlanSlug: input.pendingPlanSlug,
      },
    });
  }

  async previewProratedUpgrade(input: {
    stripeSubscriptionId: string;
    priceId: string;
    promotionCodeId?: string;
    promo?: { code: string; label: string };
  }): Promise<CheckoutPricing> {
    const stripe = this.getClient();
    const subscription = await stripe.subscriptions.retrieve(
      input.stripeSubscriptionId,
    );
    const itemId = subscription.items.data[0]?.id;

    if (!itemId) {
      throw new BadRequestException("Subscription has no items");
    }

    try {
      const preview = await stripe.invoices.createPreview({
        subscription: input.stripeSubscriptionId,
        subscription_details: {
          items: [{ id: itemId, price: input.priceId }],
          proration_behavior: "always_invoice",
        },
        ...(input.promotionCodeId
          ? { discounts: [{ promotion_code: input.promotionCodeId }] }
          : {}),
      });

      return this.extractInvoicePricing(preview, input.promo);
    } catch (error) {
      this.throwCheckoutStripeError(error, "Failed to preview upgrade");
    }
  }

  private async resolveInvoiceClientSecret(
    stripe: Stripe,
    invoice: Stripe.Invoice,
  ): Promise<string | null> {
    const invoiceId = invoice.id;
    const resolved = invoiceId
      ? await stripe.invoices.retrieve(invoiceId, {
          expand: ["payment_intent", "confirmation_secret"],
        })
      : invoice;

    const paymentIntent = (
      resolved as Stripe.Invoice & {
        payment_intent?: Stripe.PaymentIntent | string | null;
      }
    ).payment_intent;

    if (paymentIntent && typeof paymentIntent !== "string") {
      if (paymentIntent.client_secret) {
        return paymentIntent.client_secret;
      }
    } else if (typeof paymentIntent === "string") {
      const intent = await stripe.paymentIntents.retrieve(paymentIntent);
      return intent.client_secret ?? null;
    }

    return resolved.confirmation_secret?.client_secret ?? null;
  }

  private requiresPaymentAction(
    error: unknown,
    invoice?: Stripe.Invoice,
  ): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const stripeError = error as Stripe.errors.StripeError;
    const message = stripeError.message?.toLowerCase() ?? "";

    if (
      stripeError.code === "authentication_required" ||
      stripeError.decline_code === "authentication_required" ||
      stripeError.code === "invoice_payment_intent_requires_action" ||
      message.includes("requires additional user action") ||
      message.includes("requires_action")
    ) {
      return true;
    }

    const paymentIntent = (
      invoice as Stripe.Invoice & {
        payment_intent?: Stripe.PaymentIntent | string | null;
      }
    )?.payment_intent;

    return (
      typeof paymentIntent === "object" &&
      paymentIntent?.status === "requires_action"
    );
  }

  async createProratedUpgradePayment(input: {
    stripeSubscriptionId: string;
    priceId: string;
    organizationId: string;
    planSlug: PlanSlug;
    billingCycle?: BillingCycleSlug;
    promotionCodeId?: string;
    promo?: { code: string; label: string };
  }): Promise<{
    clientSecret: string | null;
    amountDue: number;
    invoicePaid: boolean;
    pricing?: CheckoutPricing;
  }> {
    const stripe = this.getClient();
    const subscription = await stripe.subscriptions.retrieve(
      input.stripeSubscriptionId,
    );
    const itemId = subscription.items.data[0]?.id;

    if (!itemId) {
      throw new BadRequestException("Subscription has no items");
    }

    const updateParams: Stripe.SubscriptionUpdateParams = {
      items: [{ id: itemId, price: input.priceId }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
      metadata: {
        ...subscription.metadata,
        organizationId: input.organizationId,
        planSlug: input.planSlug,
        pendingPlanSlug: "",
        ...(input.billingCycle ? { billingCycle: input.billingCycle } : {}),
      },
      expand: [
        "latest_invoice.payment_intent",
        "latest_invoice.confirmation_secret",
      ],
      ...(input.promotionCodeId
        ? { discounts: [{ promotion_code: input.promotionCodeId }] }
        : {}),
    };

    let updated: Stripe.Subscription;
    try {
      updated = await stripe.subscriptions.update(
        input.stripeSubscriptionId,
        updateParams,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to upgrade subscription";
      throw new BadRequestException(message);
    }

    const invoice = updated.latest_invoice;
    if (!invoice || typeof invoice === "string") {
      throw new BadRequestException(
        "Failed to create prorated upgrade invoice",
      );
    }

    const amountDue = invoice.amount_due ?? 0;
    const invoicePaid = invoice.status === "paid" || amountDue === 0;
    const pricing = this.extractInvoicePricing(invoice, input.promo);

    if (invoicePaid) {
      return { clientSecret: null, amountDue: 0, invoicePaid: true, pricing };
    }

    if (invoice.id) {
      try {
        const paidInvoice = await stripe.invoices.pay(invoice.id, {
          off_session: true,
        });
        if (
          paidInvoice.status === "paid" ||
          (paidInvoice.amount_due ?? 0) === 0
        ) {
          return {
            clientSecret: null,
            amountDue: 0,
            invoicePaid: true,
            pricing: this.extractInvoicePricing(paidInvoice, input.promo),
          };
        }
      } catch (error) {
        const clientSecret = await this.resolveInvoiceClientSecret(
          stripe,
          invoice,
        );
        if (clientSecret) {
          return { clientSecret, amountDue, invoicePaid: false, pricing };
        }

        const message =
          error instanceof Error ? error.message : "Payment failed";
        throw new BadRequestException(message);
      }
    }

    const clientSecret = await this.resolveInvoiceClientSecret(stripe, invoice);
    if (!clientSecret) {
      throw new BadRequestException("Failed to create payment client secret");
    }

    return { clientSecret, amountDue, invoicePaid: false, pricing };
  }

  async updateSubscriptionPrice(
    stripeSubscriptionId: string,
    priceId: string,
  ): Promise<StripeSubscription> {
    const stripe = this.getClient();
    const subscription =
      await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const itemId = subscription.items.data[0]?.id;

    if (!itemId) {
      throw new BadRequestException("Subscription has no items");
    }

    return stripe.subscriptions.update(stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "create_prorations",
    });
  }

  async cancelScheduledChanges(
    stripeSubscriptionId: string,
    input: { organizationId: string; planSlug: PlanSlug },
  ): Promise<StripeSubscription> {
    const stripe = this.getClient();
    const subscription =
      await stripe.subscriptions.retrieve(stripeSubscriptionId);

    if (subscription.schedule) {
      const scheduleId =
        typeof subscription.schedule === "string"
          ? subscription.schedule
          : subscription.schedule.id;
      await stripe.subscriptionSchedules.release(scheduleId);
    }

    const refreshed = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const metadata = { ...refreshed.metadata };

    return stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: false,
      metadata: {
        ...metadata,
        organizationId: input.organizationId,
        planSlug: input.planSlug,
        pendingPlanSlug: "",
      },
    });
  }

  async cancelSubscription(
    stripeSubscriptionId: string,
  ): Promise<StripeSubscription> {
    const stripe = this.getClient();
    return stripe.subscriptions.cancel(stripeSubscriptionId);
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const stripe = this.getClient();
    const webhookSecret = this.configService
      .get<string>("STRIPE_WEBHOOK_SECRET")
      ?.trim();

    if (!webhookSecret) {
      throw new BadRequestException("Stripe webhook secret is not configured");
    }

    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
