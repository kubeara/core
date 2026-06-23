import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import dayjs from "dayjs";
import type Stripe from "stripe";
import { PlanEntity } from "../entities/plan.entity";
import { SubscriptionEntity } from "../entities/subscription.entity";
import { PlanSlug } from "../enums/plan-slug.enum";
import { SubscriptionStatus } from "../enums/subscription-status.enum";
import { StripeService } from "./stripe.service";
import { SubscriptionNotificationService } from "./subscription-notification.service";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";

export interface PlanResponse {
  id: string;
  slug: PlanSlug;
  name: string;
  description: string | null;
  priceMonthly: number;
  features: string[];
  sortOrder: number;
}

export interface SubscriptionResponse {
  id: string;
  plan: PlanResponse;
  pendingPlan: PlanResponse | null;
  scheduledChangeAt: number | null;
  subscriptionStatus: SubscriptionStatus;
  startedAt: number;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  canceledAt: number | null;
  billingAmount: number;
  stripeCustomerId: string | null;
}

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepository: Repository<PlanEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
    private readonly stripeService: StripeService,
    private readonly notificationService: SubscriptionNotificationService,
    private readonly configService: ConfigService,
  ) {}

  private toPlanResponse(plan: PlanEntity): PlanResponse {
    return {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      description: plan.description,
      priceMonthly: Number(plan.priceMonthly) || 0,
      features: plan.features ?? [],
      sortOrder: plan.sortOrder,
    };
  }

  private toSubscriptionResponse(
    subscription: SubscriptionEntity,
    pendingPlan: PlanEntity | null = null,
  ): SubscriptionResponse {
    return {
      id: subscription.id,
      plan: this.toPlanResponse(subscription.plan),
      pendingPlan: pendingPlan ? this.toPlanResponse(pendingPlan) : null,
      scheduledChangeAt: pendingPlan ? subscription.currentPeriodEnd : null,
      subscriptionStatus: subscription.subscriptionStatus,
      startedAt: subscription.startedAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      canceledAt: subscription.canceledAt,
      billingAmount: Number(subscription.billingAmount) || 0,
      stripeCustomerId: subscription.stripeCustomerId,
    };
  }

  private formatScheduledChangeDate(unix: number | null): string {
    if (!unix) return "the next billing cycle";
    return dayjs.unix(unix).format("MMMM D, YYYY");
  }

  private async getPendingPlan(
    subscription: SubscriptionEntity,
  ): Promise<PlanEntity | null> {
    if (
      !subscription.stripeSubscriptionId ||
      !this.stripeService.isConfigured()
    ) {
      return null;
    }

    const stripeSub = await this.stripeService
      .getClient()
      .subscriptions.retrieve(subscription.stripeSubscriptionId);
    const pendingPlanSlug = stripeSub.metadata?.pendingPlanSlug as
      | PlanSlug
      | undefined;

    if (!pendingPlanSlug) {
      return null;
    }

    return this.getPlanBySlug(pendingPlanSlug);
  }

  private async resolvePlanFromStripeSubscription(
    stripeSub: Stripe.Subscription,
  ): Promise<PlanEntity | null> {
    const price = stripeSub.items.data[0]?.price;
    const priceId = typeof price === "string" ? price : price?.id;

    if (priceId) {
      const plan = await this.planRepository.findOne({
        where: { stripePriceId: priceId },
      });
      if (plan) {
        return plan;
      }
    }

    const planSlug = stripeSub.metadata?.planSlug as PlanSlug | undefined;
    if (!planSlug) {
      return null;
    }

    try {
      return await this.getPlanBySlug(planSlug);
    } catch {
      return null;
    }
  }

  async getPlanBySlug(slug: PlanSlug): Promise<PlanEntity> {
    const plan = await this.planRepository.findOne({ where: { slug } });
    if (!plan) {
      throw new NotFoundException(`Plan "${slug}" not found`);
    }
    return plan;
  }

  async listPlans() {
    const plans = await this.planRepository.find({
      where: { status: EntityStatus.ACTIVE },
      order: { sortOrder: "ASC" },
    });

    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.PLANS,
      data: plans.map((plan) => this.toPlanResponse(plan)),
    };
  }

  async getOrganizationSubscription(organizationId: string) {
    let subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: EntityStatus.ACTIVE },
      relations: { plan: true },
      order: { createdAt: "DESC" },
    });

    if (!subscription) {
      throw new NotFoundException("No active subscription found");
    }

    subscription = await this.syncSubscriptionFromStripe(subscription);

    const pendingPlan = await this.getPendingPlan(subscription);

    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CURRENT,
      data: this.toSubscriptionResponse(subscription, pendingPlan),
    };
  }

  async createFreeSubscription(input: {
    organizationId: string;
    email?: string;
    name?: string;
  }): Promise<SubscriptionEntity> {
    const freePlan = await this.getPlanBySlug(PlanSlug.FREE);
    const now = dayjs().unix();

    let stripeCustomerId: string | null = null;
    if (input.email && this.stripeService.isConfigured()) {
      stripeCustomerId = await this.stripeService.createCustomer({
        email: input.email,
        name: input.name ?? input.email,
        organizationId: input.organizationId,
      });
    }

    const subscription = this.subscriptionRepository.create({
      organizationId: input.organizationId,
      planId: freePlan.id,
      stripeCustomerId,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: null,
      billingAmount: freePlan.priceMonthly,
      status: EntityStatus.ACTIVE,
    });

    return this.subscriptionRepository.save(subscription);
  }

  async createCheckoutSession(
    organizationId: string,
    planSlug: PlanSlug,
    userEmail: string,
    userName: string,
  ) {
    if (planSlug === PlanSlug.FREE) {
      throw new BadRequestException(
        "Use change-plan to switch to the free plan",
      );
    }

    const plan = await this.getPlanBySlug(planSlug);
    const priceId = plan.stripePriceId;

    if (!priceId) {
      throw new BadRequestException(
        "Stripe price ID is not configured for this plan",
      );
    }

    const subscription = await this.getOrCreateSubscription(organizationId);

    const customerName = userName?.trim() || userEmail;

    let customerId = subscription.stripeCustomerId;
    if (!customerId) {
      customerId = await this.stripeService.createCustomer({
        organizationId,
        email: userEmail,
        name: customerName,
      });
      if (customerId) {
        subscription.stripeCustomerId = customerId;
        await this.subscriptionRepository.save(subscription);
      }
    } else {
      await this.stripeService.updateCustomer(customerId, {
        email: userEmail,
        name: customerName,
      });
    }

    if (!customerId) {
      throw new BadRequestException("Stripe is not configured");
    }

    const publishableKey =
      this.configService.get<string>("STRIPE_PUBLISHABLE_KEY")?.trim() ?? "";

    if (!publishableKey) {
      throw new BadRequestException("Stripe publishable key is not configured");
    }

    const { clientSecret, subscriptionId } =
      await this.stripeService.createSubscriptionPayment({
        customerId,
        priceId,
        organizationId,
        planSlug,
      });

    subscription.stripeSubscriptionId = subscriptionId;
    await this.subscriptionRepository.save(subscription);

    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CHECKOUT,
      data: {
        clientSecret,
        publishableKey,
        plan: this.toPlanResponse(plan),
      },
    };
  }

  async confirmCheckout(organizationId: string, planSlug: PlanSlug) {
    const plan = await this.getPlanBySlug(planSlug);
    const subscription = await this.getOrCreateSubscription(organizationId);

    if (!this.stripeService.isConfigured()) {
      throw new BadRequestException("Stripe is not configured");
    }

    const stripe = this.stripeService.getClient();
    let stripeSub: Stripe.Subscription | null = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      if (subscription.stripeSubscriptionId) {
        const retrieved = await stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId,
        );
        if (
          (retrieved.status === "active" || retrieved.status === "trialing") &&
          this.stripeSubscriptionMatchesPlan(
            retrieved,
            planSlug,
            plan.stripePriceId,
          )
        ) {
          stripeSub = retrieved;
          break;
        }
      }

      if (subscription.stripeCustomerId) {
        const result = await stripe.subscriptions.list({
          customer: subscription.stripeCustomerId,
          limit: 20,
        });
        stripeSub =
          result.data.find(
            (item) =>
              (item.status === "active" || item.status === "trialing") &&
              this.stripeSubscriptionMatchesPlan(
                item,
                planSlug,
                plan.stripePriceId,
              ),
          ) ?? null;
        if (stripeSub) {
          break;
        }
      }

      if (attempt < 7) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!stripeSub) {
      throw new BadRequestException(
        "Payment is still processing. Please try again in a moment.",
      );
    }

    this.applyStripeSubscription(subscription, plan, stripeSub);
    await this.subscriptionRepository.save(subscription);

    return this.getOrganizationSubscription(organizationId);
  }

  async changePlan(organizationId: string, planSlug: PlanSlug) {
    const targetPlan = await this.getPlanBySlug(planSlug);
    const subscription = await this.getOrCreateSubscription(organizationId);
    const previousPlanName = subscription.plan.name;

    if (subscription.plan.slug === planSlug) {
      throw new BadRequestException("Already on this plan");
    }

    if (planSlug === PlanSlug.FREE) {
      if (
        subscription.stripeSubscriptionId &&
        this.stripeService.isConfigured()
      ) {
        const stripeSub = await this.stripeService.scheduleCancelAtPeriodEnd(
          subscription.stripeSubscriptionId,
          { organizationId, planSlug: subscription.plan.slug },
        );
        const periodItem = stripeSub.items.data[0];
        subscription.currentPeriodEnd =
          periodItem?.current_period_end ?? subscription.currentPeriodEnd;
        subscription.canceledAt = stripeSub.cancel_at;
        await this.subscriptionRepository.save(subscription);

        return {
          message: `Downgrade to ${targetPlan.name} scheduled for ${this.formatScheduledChangeDate(subscription.currentPeriodEnd)}`,
          data: this.toSubscriptionResponse(subscription, targetPlan),
        };
      }

      subscription.planId = targetPlan.id;
      subscription.plan = targetPlan;
      subscription.stripeSubscriptionId = null;
      subscription.subscriptionStatus = SubscriptionStatus.ACTIVE;
      subscription.canceledAt = null;
      subscription.billingAmount = targetPlan.priceMonthly;
      subscription.currentPeriodEnd = null;

      await this.subscriptionRepository.save(subscription);

      this.notificationService.notifyPlanChanged({
        organizationId,
        previousPlan: previousPlanName,
        newPlan: targetPlan.name,
      });

      return {
        message: SUCCESS_MESSAGES.SUBSCRIPTIONS.PLAN_CHANGED,
        data: this.toSubscriptionResponse(subscription),
      };
    }

    if (targetPlan.priceMonthly < subscription.plan.priceMonthly) {
      if (
        subscription.stripeSubscriptionId &&
        this.stripeService.isConfigured()
      ) {
        const priceId = targetPlan.stripePriceId;

        if (!priceId) {
          throw new BadRequestException(
            "Stripe price ID is not configured for this plan",
          );
        }

        const stripeSub =
          await this.stripeService.scheduleSubscriptionDowngrade({
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            newPriceId: priceId,
            organizationId,
            currentPlanSlug: subscription.plan.slug,
            pendingPlanSlug: planSlug,
          });

        const periodItem = stripeSub.items.data[0];
        subscription.currentPeriodEnd =
          periodItem?.current_period_end ?? subscription.currentPeriodEnd;
        await this.subscriptionRepository.save(subscription);

        return {
          message: `Downgrade to ${targetPlan.name} scheduled for ${this.formatScheduledChangeDate(subscription.currentPeriodEnd)}`,
          data: this.toSubscriptionResponse(subscription, targetPlan),
        };
      }
    }

    throw new BadRequestException(
      "Paid plan changes require Stripe checkout. Use the upgrade action.",
    );
  }

  async cancelSubscription(organizationId: string) {
    const subscription = await this.getOrCreateSubscription(organizationId);
    const previousPlanName = subscription.plan.name;

    if (subscription.plan.slug === PlanSlug.FREE) {
      throw new BadRequestException("Free plan cannot be canceled");
    }

    if (this.stripeService.isConfigured()) {
      const stripeSubscriptionId =
        await this.resolveStripeSubscriptionId(subscription);

      if (!stripeSubscriptionId) {
        throw new BadRequestException(
          "No active Stripe subscription found to cancel",
        );
      }

      subscription.stripeSubscriptionId = stripeSubscriptionId;
      const stripeSub = await this.stripeService.scheduleCancelAtPeriodEnd(
        stripeSubscriptionId,
        { organizationId, planSlug: subscription.plan.slug },
      );
      const periodItem = stripeSub.items.data[0];
      subscription.currentPeriodEnd =
        periodItem?.current_period_end ?? subscription.currentPeriodEnd;
      subscription.canceledAt = stripeSub.cancel_at;
      await this.subscriptionRepository.save(subscription);

      const freePlan = await this.getPlanBySlug(PlanSlug.FREE);
      const endDate = this.formatScheduledChangeDate(
        subscription.currentPeriodEnd,
      );

      this.notificationService.notifySubscriptionCanceled({
        organizationId,
        planName: previousPlanName,
      });

      return {
        message: `Subscription canceled. You will keep ${previousPlanName} access until ${endDate}. No further payments will be charged.`,
        data: this.toSubscriptionResponse(subscription, freePlan),
      };
    }

    const freePlan = await this.getPlanBySlug(PlanSlug.FREE);
    subscription.planId = freePlan.id;
    subscription.plan = freePlan;
    subscription.stripeSubscriptionId = null;
    subscription.subscriptionStatus = SubscriptionStatus.CANCELED;
    subscription.canceledAt = dayjs().unix();
    subscription.billingAmount = freePlan.priceMonthly;
    subscription.currentPeriodEnd = null;

    await this.subscriptionRepository.save(subscription);

    this.notificationService.notifySubscriptionCanceled({
      organizationId,
      planName: previousPlanName,
    });

    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CANCELED,
      data: this.toSubscriptionResponse(subscription),
    };
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.updated":
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.paid":
        await this.handleInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed":
        await this.handlePaymentFailed(event.data.object);
        break;
      default:
        break;
    }
  }

  private async resolveStripeSubscriptionId(
    subscription: SubscriptionEntity,
  ): Promise<string | null> {
    if (subscription.stripeSubscriptionId) {
      return subscription.stripeSubscriptionId;
    }

    if (!subscription.stripeCustomerId || !this.stripeService.isConfigured()) {
      return null;
    }

    const result = await this.stripeService.getClient().subscriptions.list({
      customer: subscription.stripeCustomerId,
      limit: 20,
    });

    const stripeSub =
      result.data.find(
        (item) =>
          item.status === "active" ||
          item.status === "trialing" ||
          item.status === "past_due",
      ) ?? null;

    return stripeSub?.id ?? null;
  }

  private stripeSubscriptionMatchesPlan(
    stripeSub: Stripe.Subscription,
    planSlug: PlanSlug,
    stripePriceId: string | null,
  ): boolean {
    if ((stripeSub.metadata?.planSlug as PlanSlug | undefined) === planSlug) {
      return true;
    }

    const price = stripeSub.items.data[0]?.price;
    const priceId = typeof price === "string" ? price : price?.id;
    return !!stripePriceId && priceId === stripePriceId;
  }

  private async syncSubscriptionFromStripe(
    subscription: SubscriptionEntity,
  ): Promise<SubscriptionEntity> {
    if (!this.stripeService.isConfigured()) {
      return subscription;
    }

    let stripeSub: Stripe.Subscription | null = null;

    if (subscription.stripeSubscriptionId) {
      stripeSub = await this.stripeService
        .getClient()
        .subscriptions.retrieve(subscription.stripeSubscriptionId);
    } else if (subscription.stripeCustomerId) {
      const result = await this.stripeService.getClient().subscriptions.list({
        customer: subscription.stripeCustomerId,
        limit: 10,
      });
      stripeSub =
        result.data.find(
          (item) => item.status === "active" || item.status === "trialing",
        ) ?? null;
    }

    if (
      !stripeSub ||
      (stripeSub.status !== "active" && stripeSub.status !== "trialing")
    ) {
      return subscription;
    }

    await this.handleSubscriptionUpdated(stripeSub);

    return this.subscriptionRepository.findOneOrFail({
      where: { id: subscription.id },
      relations: { plan: true },
    });
  }

  private async getOrCreateSubscription(
    organizationId: string,
  ): Promise<SubscriptionEntity> {
    let subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: EntityStatus.ACTIVE },
      relations: { plan: true },
      order: { createdAt: "DESC" },
    });

    if (!subscription) {
      subscription = await this.createFreeSubscription({ organizationId });
      subscription = await this.subscriptionRepository.findOneOrFail({
        where: { id: subscription.id },
        relations: { plan: true },
      });
    }

    return subscription;
  }

  private applyStripeSubscription(
    subscription: SubscriptionEntity,
    plan: PlanEntity,
    stripeSub: Stripe.Subscription,
  ): void {
    const periodItem = stripeSub.items.data[0];

    subscription.planId = plan.id;
    subscription.plan = plan;
    subscription.stripeSubscriptionId = stripeSub.id;
    subscription.subscriptionStatus = this.mapStripeStatus(stripeSub.status);
    subscription.billingAmount = plan.priceMonthly;
    subscription.currentPeriodStart = periodItem?.current_period_start ?? null;
    subscription.currentPeriodEnd = periodItem?.current_period_end ?? null;
    subscription.canceledAt = stripeSub.canceled_at;
  }

  private mapStripeStatus(status: string): SubscriptionStatus {
    switch (status) {
      case "active":
        return SubscriptionStatus.ACTIVE;
      case "canceled":
        return SubscriptionStatus.CANCELED;
      case "past_due":
        return SubscriptionStatus.PAST_DUE;
      case "trialing":
        return SubscriptionStatus.TRIALING;
      case "unpaid":
        return SubscriptionStatus.UNPAID;
      default:
        return SubscriptionStatus.INCOMPLETE;
    }
  }

  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const organizationId = session.metadata?.organizationId;
    const planSlug = session.metadata?.planSlug as PlanSlug | undefined;

    if (!organizationId || !planSlug) {
      return;
    }

    const plan = await this.getPlanBySlug(planSlug);
    const subscription = await this.getOrCreateSubscription(organizationId);

    subscription.stripeCustomerId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer?.id ?? subscription.stripeCustomerId);

    if (typeof session.subscription === "string") {
      subscription.stripeSubscriptionId = session.subscription;
    }

    if (
      this.stripeService.isConfigured() &&
      subscription.stripeSubscriptionId
    ) {
      const stripeSub = await this.stripeService
        .getClient()
        .subscriptions.retrieve(subscription.stripeSubscriptionId);
      this.applyStripeSubscription(subscription, plan, stripeSub);
    } else {
      subscription.planId = plan.id;
      subscription.plan = plan;
      subscription.subscriptionStatus = SubscriptionStatus.ACTIVE;
      subscription.billingAmount = plan.priceMonthly;
      subscription.startedAt = dayjs().unix();
    }

    await this.subscriptionRepository.save(subscription);

    this.notificationService.notifyPlanChanged({
      organizationId,
      previousPlan: "previous",
      newPlan: plan.name,
    });
  }

  private async handleSubscriptionUpdated(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const organizationId = stripeSub.metadata?.organizationId;
    if (!organizationId) {
      return;
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: EntityStatus.ACTIVE },
      relations: { plan: true },
    });

    if (!subscription) {
      return;
    }

    subscription.stripeSubscriptionId = stripeSub.id;
    subscription.subscriptionStatus = this.mapStripeStatus(stripeSub.status);

    const previousPlanId = subscription.planId;

    if (stripeSub.status === "active" || stripeSub.status === "trialing") {
      const plan = await this.resolvePlanFromStripeSubscription(stripeSub);
      if (plan) {
        subscription.planId = plan.id;
        subscription.plan = plan;
        subscription.billingAmount = plan.priceMonthly;
      }
    }

    const periodItem = stripeSub.items.data[0];
    subscription.currentPeriodStart = periodItem?.current_period_start ?? null;
    subscription.currentPeriodEnd = periodItem?.current_period_end ?? null;
    subscription.canceledAt = stripeSub.cancel_at;

    await this.subscriptionRepository.save(subscription);

    if (subscription.planId !== previousPlanId) {
      const previousPlan = await this.planRepository.findOne({
        where: { id: previousPlanId },
      });
      this.notificationService.notifyPlanChanged({
        organizationId,
        previousPlan: previousPlan?.name ?? "previous",
        newPlan: subscription.plan.name,
      });
    } else {
      this.notificationService.notifySubscriptionRenewed({
        organizationId,
        planName: subscription.plan.name,
        renewalDate: subscription.currentPeriodEnd,
      });
    }
  }

  private async handleSubscriptionDeleted(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const organizationId = stripeSub.metadata?.organizationId;
    if (!organizationId) {
      return;
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: EntityStatus.ACTIVE },
      relations: { plan: true },
    });

    if (!subscription) {
      return;
    }

    const freePlan = await this.getPlanBySlug(PlanSlug.FREE);
    subscription.planId = freePlan.id;
    subscription.plan = freePlan;
    subscription.stripeSubscriptionId = null;
    subscription.subscriptionStatus = SubscriptionStatus.CANCELED;
    subscription.canceledAt = dayjs().unix();
    subscription.billingAmount = freePlan.priceMonthly;
    subscription.currentPeriodEnd = null;

    await this.subscriptionRepository.save(subscription);

    this.notificationService.notifySubscriptionCanceled({
      organizationId,
      planName: subscription.plan.name,
    });
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionRef =
      invoice.parent?.subscription_details?.subscription ?? null;
    const subscriptionId =
      typeof subscriptionRef === "string"
        ? subscriptionRef
        : subscriptionRef?.id;

    if (!subscriptionId) {
      return;
    }

    const stripeSub = await this.stripeService
      .getClient()
      .subscriptions.retrieve(subscriptionId);
    await this.handleSubscriptionUpdated(stripeSub);
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) {
      return;
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeCustomerId: customerId, status: EntityStatus.ACTIVE },
      relations: { plan: true },
    });

    if (!subscription) {
      return;
    }

    subscription.subscriptionStatus = SubscriptionStatus.PAST_DUE;
    await this.subscriptionRepository.save(subscription);

    this.notificationService.notifyPaymentFailed({
      organizationId: subscription.organizationId,
      planName: subscription.plan.name,
    });
  }
}
