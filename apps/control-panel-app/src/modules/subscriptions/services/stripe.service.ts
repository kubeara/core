import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PlanSlug } from "../enums/plan-slug.enum";

type StripeSubscription = Stripe.Subscription;

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

  async createSubscriptionPayment(input: {
    customerId: string;
    priceId: string;
    organizationId: string;
    planSlug: PlanSlug;
  }): Promise<{ clientSecret: string; subscriptionId: string }> {
    const stripe = this.getClient();

    const subscription = await stripe.subscriptions.create({
      customer: input.customerId,
      items: [{ price: input.priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.confirmation_secret"],
      metadata: {
        organizationId: input.organizationId,
        planSlug: input.planSlug,
      },
    });

    const invoice = subscription.latest_invoice;
    if (!invoice || typeof invoice === "string") {
      throw new BadRequestException("Failed to create subscription invoice");
    }

    const clientSecret = invoice.confirmation_secret?.client_secret;
    if (!clientSecret) {
      throw new BadRequestException("Failed to create payment client secret");
    }

    return { clientSecret, subscriptionId: subscription.id };
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
            start_date: existingSchedule.phases[0]!.start_date,
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
  }): Promise<{ amountDue: number }> {
    const stripe = this.getClient();
    const subscription = await stripe.subscriptions.retrieve(
      input.stripeSubscriptionId,
    );
    const itemId = subscription.items.data[0]?.id;

    if (!itemId) {
      throw new BadRequestException("Subscription has no items");
    }

    const preview = await stripe.invoices.createPreview({
      subscription: input.stripeSubscriptionId,
      subscription_details: {
        items: [{ id: itemId, price: input.priceId }],
        proration_behavior: "always_invoice",
      },
    });

    return { amountDue: preview.amount_due ?? 0 };
  }

  async createProratedUpgradePayment(input: {
    stripeSubscriptionId: string;
    priceId: string;
    organizationId: string;
    planSlug: PlanSlug;
  }): Promise<{
    clientSecret: string | null;
    amountDue: number;
    invoicePaid: boolean;
  }> {
    const stripe = this.getClient();
    const subscription = await stripe.subscriptions.retrieve(
      input.stripeSubscriptionId,
    );
    const itemId = subscription.items.data[0]?.id;

    if (!itemId) {
      throw new BadRequestException("Subscription has no items");
    }

    const updated = await stripe.subscriptions.update(
      input.stripeSubscriptionId,
      {
        items: [{ id: itemId, price: input.priceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
        metadata: {
          ...subscription.metadata,
          organizationId: input.organizationId,
          planSlug: input.planSlug,
          pendingPlanSlug: "",
        },
        expand: ["latest_invoice.confirmation_secret"],
      },
    );

    const invoice = updated.latest_invoice;
    if (!invoice || typeof invoice === "string") {
      throw new BadRequestException("Failed to create prorated upgrade invoice");
    }

    const amountDue = invoice.amount_due ?? 0;
    const invoicePaid = invoice.status === "paid" || amountDue === 0;

    if (invoicePaid) {
      return { clientSecret: null, amountDue: 0, invoicePaid: true };
    }

    const clientSecret = invoice.confirmation_secret?.client_secret ?? null;

    if (!clientSecret) {
      throw new BadRequestException("Failed to create payment client secret");
    }

    return { clientSecret, amountDue, invoicePaid: false };
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

    const refreshed =
      await stripe.subscriptions.retrieve(stripeSubscriptionId);
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
