import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import dayjs from "dayjs";
import type Stripe from "stripe";
import { PlanEntity } from "../entities/plan.entity";
import { BillingCycleEntity } from "../entities/billing-cycle.entity";
import { SubscriptionEntity } from "../entities/subscription.entity";
import { BillingCycleSlug } from "../enums/billing-cycle.enum";
import { CheckoutPricing } from "../interfaces/checkout-pricing.interface";
import { PlanSlug } from "../enums/plan-slug.enum";
import { SubscriptionStatus } from "../enums/subscription-status.enum";
import { PendingDowngradeStatus } from "../enums/pending-downgrade-status.enum";
import { StripeService } from "./stripe.service";
import { SubscriptionNotificationService } from "./subscription-notification.service";
import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { SUCCESS_MESSAGES } from "@control-panel/constants/success";
import { McpAccess, PlanFeatures } from "../interfaces/plan-features.interface";
import {
  getPlanFeatureRows,
  getPlanServerBadge,
  hasMcpAccess,
  normalizePlanFeatures,
} from "../utils/plan-features.util";
import {
  collectPlanStripePriceIds,
  getPlanPrice,
  normalizeBillingCycleSlug,
  resolveBillingCycleFromPlan,
  resolvePlanStripePriceId,
} from "../utils/billing.util";
import {
  comparePlanTiers,
  getPlanTierSlug,
  resolveCheckoutPlanSlug,
} from "../utils/plan-slug.util";

export interface BillingCycleResponse {
  slug: BillingCycleSlug;
  label: string;
  badge: string | null;
  discountPercent: number;
  sortOrder: number;
}

export interface PlanResponse {
  id: string;
  slug: PlanSlug;
  tierSlug: string;
  billingCycle: BillingCycleSlug;
  name: string;
  description: string | null;
  price: number;
  listPrice: number | null;
  features: PlanFeatures;
  featureRows: ReturnType<typeof getPlanFeatureRows>;
  serverBadge: string;
  sortOrder: number;
}

export interface SubscriptionResponse {
  id: string;
  plan: PlanResponse;
  pendingPlan: PlanResponse | null;
  scheduledChangeAt: number | null;
  pendingDowngradeStatus: PendingDowngradeStatus | null;
  subscriptionStatus: SubscriptionStatus;
  startedAt: number;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  canceledAt: number | null;
  billingAmount: number;
  billingListAmount: number | null;
  billingDiscountAmount: number;
  promoCode: string | null;
  billingCycle: BillingCycleSlug;
  stripeCustomerId: string | null;
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
}

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepository: Repository<PlanEntity>,
    @InjectRepository(BillingCycleEntity)
    private readonly billingCycleRepository: Repository<BillingCycleEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
    private readonly stripeService: StripeService,
    private readonly notificationService: SubscriptionNotificationService,
    private readonly configService: ConfigService,
  ) {}

  private toPlanResponse(plan: PlanEntity): PlanResponse {
    const features = normalizePlanFeatures(plan.features, plan.slug);

    return {
      id: plan.id,
      slug: plan.slug,
      tierSlug: plan.tierSlug ?? getPlanTierSlug(plan.slug),
      billingCycle: resolveBillingCycleFromPlan(plan),
      name: plan.name,
      description: plan.description,
      price: Number(plan.price) || 0,
      listPrice: plan.listPrice == null ? null : Number(plan.listPrice) || 0,
      features,
      featureRows: getPlanFeatureRows(plan.slug, features),
      serverBadge: getPlanServerBadge(features, plan.slug),
      sortOrder: plan.sortOrder,
    };
  }

  private toSubscriptionResponse(
    subscription: SubscriptionEntity,
  ): SubscriptionResponse {
    const hasPending =
      subscription.pendingDowngradeStatus ===
        PendingDowngradeStatus.SCHEDULED && subscription.pendingPlan;

    return {
      id: subscription.id,
      plan: this.toPlanResponse(subscription.plan),
      pendingPlan: hasPending
        ? this.toPlanResponse(subscription.pendingPlan!)
        : null,
      scheduledChangeAt: hasPending ? subscription.pendingEffectiveAt : null,
      pendingDowngradeStatus: subscription.pendingDowngradeStatus,
      subscriptionStatus: subscription.subscriptionStatus,
      startedAt: subscription.startedAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      canceledAt: subscription.canceledAt,
      billingAmount: Number(subscription.billingAmount) || 0,
      billingListAmount:
        subscription.billingListAmount == null
          ? Number(subscription.billingAmount) || 0
          : Number(subscription.billingListAmount) || 0,
      billingDiscountAmount: Number(subscription.billingDiscountAmount) || 0,
      promoCode: subscription.promoCode,
      billingCycle: normalizeBillingCycleSlug(subscription.billingCycle),
      stripeCustomerId: subscription.stripeCustomerId,
    };
  }

  private formatScheduledChangeDate(unix: number | null): string {
    if (!unix) return "the next billing cycle";
    return dayjs.unix(unix).format("MMMM D, YYYY");
  }

  private setPendingDowngrade(
    subscription: SubscriptionEntity,
    targetPlan: PlanEntity,
    effectiveAt: number | null,
  ): void {
    subscription.pendingPlanId = targetPlan.id;
    subscription.pendingPlan = targetPlan;
    subscription.pendingEffectiveAt = effectiveAt;
    subscription.pendingDowngradeStatus = PendingDowngradeStatus.SCHEDULED;
  }

  private clearPendingDowngrade(subscription: SubscriptionEntity): void {
    subscription.pendingPlanId = null;
    subscription.pendingPlan = null;
    subscription.pendingEffectiveAt = null;
    subscription.pendingDowngradeStatus = null;
  }

  private async clearPendingDowngradeOnStripe(
    subscription: SubscriptionEntity,
  ): Promise<void> {
    if (!this.stripeService.isConfigured()) {
      return;
    }

    const stripeSubscriptionId =
      await this.resolveStripeSubscriptionId(subscription);
    if (!stripeSubscriptionId) {
      return;
    }

    await this.stripeService.cancelScheduledChanges(stripeSubscriptionId, {
      organizationId: subscription.organizationId,
      planSlug: subscription.plan.slug,
    });
  }

  private getStripePendingPlanSlug(
    stripeSub: Stripe.Subscription,
  ): PlanSlug | null {
    const slug = stripeSub.metadata?.pendingPlanSlug?.trim();
    if (!slug) {
      return null;
    }
    return slug as PlanSlug;
  }

  private async resolvePlanFromStripeSubscription(
    stripeSub: Stripe.Subscription,
  ): Promise<PlanEntity | null> {
    const price = stripeSub.items.data[0]?.price;
    const priceId = typeof price === "string" ? price : price?.id;

    if (priceId) {
      const plan = await this.resolvePlanFromStripePriceId(priceId);
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

  private async resolvePlanFromStripePriceId(
    priceId: string,
  ): Promise<PlanEntity | null> {
    const byLegacy = await this.planRepository.findOne({
      where: { stripePriceId: priceId },
    });
    if (byLegacy) {
      return byLegacy;
    }

    const plans = await this.planRepository.find({
      where: { status: EntityStatus.ACTIVE },
    });

    return (
      plans.find((plan) => collectPlanStripePriceIds(plan).includes(priceId)) ??
      null
    );
  }

  private toBillingCycleResponse(
    cycle: BillingCycleEntity,
  ): BillingCycleResponse {
    return {
      slug: cycle.slug,
      label: cycle.label,
      badge: cycle.badge,
      discountPercent: cycle.discountPercent,
      sortOrder: cycle.sortOrder,
    };
  }

  async getPlanBySlug(slug: PlanSlug): Promise<PlanEntity> {
    const plan = await this.planRepository.findOne({ where: { slug } });
    if (!plan) {
      throw new NotFoundException(`Plan "${slug}" not found`);
    }
    return plan;
  }

  async listPlans() {
    const [plans, billingCycles] = await Promise.all([
      this.planRepository.find({
        where: { status: EntityStatus.ACTIVE },
        order: { sortOrder: "ASC", billingCycle: "ASC" },
      }),
      this.billingCycleRepository.find({
        where: { status: EntityStatus.ACTIVE },
        order: { sortOrder: "ASC" },
      }),
    ]);

    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.PLANS,
      data: {
        plans: plans.map((plan) => this.toPlanResponse(plan)),
        billingCycles: billingCycles.map((cycle) =>
          this.toBillingCycleResponse(cycle),
        ),
      },
    };
  }

  async getOrganizationSubscription(organizationId: string) {
    let subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: EntityStatus.ACTIVE },
      relations: { plan: true, pendingPlan: true },
      order: { createdAt: "DESC" },
    });

    if (!subscription) {
      throw new NotFoundException("No active subscription found");
    }

    subscription = await this.syncSubscriptionFromStripe(subscription);

    const response = this.toSubscriptionResponse(subscription);
    let paymentMethod: SubscriptionResponse["paymentMethod"] = null;

    if (
      subscription.stripeCustomerId &&
      this.stripeService.isConfigured()
    ) {
      try {
        paymentMethod = await this.stripeService.getCustomerPaymentMethodSummary(
          subscription.stripeCustomerId,
          subscription.stripeSubscriptionId,
        );
      } catch {
        paymentMethod = null;
      }
    }

    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CURRENT,
      data: { ...response, paymentMethod },
    };
  }

  async getOrganizationPlanFeatures(
    organizationId: string,
  ): Promise<PlanFeatures> {
    const subscription = await this.getOrCreateSubscription(organizationId);
    return normalizePlanFeatures(
      subscription.plan.features,
      subscription.plan.slug,
    );
  }

  async assertMcpAccess(
    organizationId: string,
    required: McpAccess = "read",
  ): Promise<void> {
    const features = await this.getOrganizationPlanFeatures(organizationId);

    if (!hasMcpAccess(features, required)) {
      throw new ForbiddenException(
        "Your plan does not include MCP server access",
      );
    }
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
      billingAmount: freePlan.price,
      billingListAmount: freePlan.price,
      billingDiscountAmount: 0,
      promoCode: null,
      stripePromotionCodeId: null,
      status: EntityStatus.ACTIVE,
    });

    return this.subscriptionRepository.save(subscription);
  }

  async createCheckoutSession(
    organizationId: string,
    planSlug: PlanSlug,
    userEmail: string,
    userName: string,
    startPayment = false,
    billingCycleInput?: BillingCycleSlug,
    promoCodeInput?: string,
    removePromo = false,
  ) {
    const resolvedSlug = resolveCheckoutPlanSlug(
      planSlug,
      billingCycleInput,
    ) as PlanSlug;

    if (getPlanTierSlug(resolvedSlug) === getPlanTierSlug(PlanSlug.FREE)) {
      throw new BadRequestException(
        "Use change-plan to switch to the free plan",
      );
    }

    const plan = await this.getPlanBySlug(resolvedSlug);
    const planBillingCycle = resolveBillingCycleFromPlan(plan);
    const priceId = resolvePlanStripePriceId(plan);

    if (!priceId) {
      throw new BadRequestException(
        `Stripe price ID is not configured for ${planBillingCycle} billing on this plan`,
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

    if (removePromo) {
      return this.createCheckoutSessionWithoutPromo({
        organizationId,
        subscription,
        plan,
        planBillingCycle,
        priceId,
        customerId,
        publishableKey,
        startPayment,
      });
    }

    const promo = promoCodeInput?.trim()
      ? await this.stripeService.resolvePromotionCode(promoCodeInput)
      : null;
    const promoMeta = promo
      ? { code: promo.code, label: promo.label }
      : undefined;
    const defaultPricing = this.buildPlanPricing(plan, promoMeta);

    const isPaidUpgrade =
      getPlanTierSlug(subscription.plan.slug) !==
        getPlanTierSlug(PlanSlug.FREE) &&
      comparePlanTiers(plan.slug, subscription.plan.slug) > 0;

    if (isPaidUpgrade && this.stripeService.isConfigured()) {
      const stripeSubscriptionId =
        await this.resolveStripeSubscriptionId(subscription);

      if (stripeSubscriptionId) {
        const stripe = this.stripeService.getClient();
        const currentStripeSub =
          await stripe.subscriptions.retrieve(stripeSubscriptionId);

        if (
          (currentStripeSub.status === "active" ||
            currentStripeSub.status === "trialing") &&
          this.stripeSubscriptionMatchesPlan(currentStripeSub, plan)
        ) {
          if (subscription.pendingDowngradeStatus) {
            await this.clearPendingDowngradeOnStripe(subscription);
            this.clearPendingDowngrade(subscription);
          }

          await this.applyStripeSubscription(
            subscription,
            plan,
            currentStripeSub,
            planBillingCycle,
          );
          await this.subscriptionRepository.save(subscription);

          return {
            message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CHECKOUT,
            data: {
              clientSecret: null,
              publishableKey,
              plan: this.toPlanResponse(plan),
              proratedUpgrade: true,
              amountDue: 0,
              immediate: true,
              pricing: defaultPricing,
            },
          };
        }

        if (!startPayment) {
          const pricing = await this.stripeService.previewProratedUpgrade({
            stripeSubscriptionId,
            priceId,
            promotionCodeId: promo?.promotionCodeId,
            promo: promoMeta,
          });
          const paymentMethod =
            await this.stripeService.getCustomerPaymentMethodSummary(
              customerId,
              stripeSubscriptionId,
            );

          return {
            message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CHECKOUT,
            data: {
              clientSecret: null,
              publishableKey,
              plan: this.toPlanResponse(plan),
              proratedUpgrade: true,
              amountDue: pricing.total,
              immediate: false,
              paymentMethod,
              pricing,
            },
          };
        }

        if (subscription.pendingDowngradeStatus) {
          await this.clearPendingDowngradeOnStripe(subscription);
          this.clearPendingDowngrade(subscription);
        }

        const { clientSecret, amountDue, invoicePaid, pricing } =
          await this.stripeService.createProratedUpgradePayment({
            stripeSubscriptionId,
            priceId,
            organizationId,
            planSlug: plan.slug,
            billingCycle: planBillingCycle,
            promotionCodeId: promo?.promotionCodeId,
            promo: promoMeta,
          });

        if (invoicePaid || amountDue === 0) {
          const stripeSub =
            await stripe.subscriptions.retrieve(stripeSubscriptionId);
          await this.applyStripeSubscription(
            subscription,
            plan,
            stripeSub,
            planBillingCycle,
          );
          await this.subscriptionRepository.save(subscription);
          const updated = await this.subscriptionRepository.findOneOrFail({
            where: { id: subscription.id },
            relations: { plan: true, pendingPlan: true },
          });

          return {
            message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CHECKOUT,
            data: {
              clientSecret: null,
              publishableKey,
              plan: this.toPlanResponse(plan),
              proratedUpgrade: true,
              amountDue: 0,
              immediate: true,
              subscription: this.toSubscriptionResponse(updated),
              pricing: pricing ?? defaultPricing,
            },
          };
        }

        return {
          message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CHECKOUT,
          data: {
            clientSecret: clientSecret!,
            publishableKey,
            plan: this.toPlanResponse(plan),
            proratedUpgrade: true,
            amountDue: pricing?.total ?? amountDue / 100,
            immediate: false,
            pricing:
              pricing ??
              this.buildPlanPricing(plan, promoMeta, amountDue / 100),
          },
        };
      }
    }

    if (
      promo &&
      subscription.stripeSubscriptionId &&
      this.stripeService.isConfigured()
    ) {
      const stripe = this.stripeService.getClient();
      const existingStripeSub = await stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
      );
      if (existingStripeSub.status === "incomplete") {
        const pricing = await this.stripeService.previewSubscriptionPromo({
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          promotionCodeId: promo.promotionCodeId,
          promo: promoMeta!,
        });
        if (pricing.discount <= 0) {
          throw new BadRequestException(
            "This promo code does not apply to this plan",
          );
        }

        const applied = await this.stripeService.applyPromotionToSubscription({
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          promotionCodeId: promo.promotionCodeId,
          promo: promoMeta!,
        });
        if (!applied.clientSecret) {
          throw new BadRequestException("Failed to apply promo code");
        }
        return {
          message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CHECKOUT,
          data: {
            clientSecret: applied.clientSecret,
            publishableKey,
            plan: this.toPlanResponse(plan),
            pricing,
          },
        };
      }
    }

    if (promo && !startPayment) {
      const pricing = await this.stripeService.previewNewSubscriptionCheckout({
        customerId,
        priceId,
        promotionCodeId: promo.promotionCodeId,
        promo: promoMeta,
      });
      if (pricing.discount <= 0) {
        throw new BadRequestException(
          "This promo code does not apply to this plan",
        );
      }
    }

    const { clientSecret, subscriptionId, pricing } =
      await this.stripeService.createSubscriptionPayment({
        customerId,
        priceId,
        organizationId,
        planSlug: plan.slug,
        billingCycle: planBillingCycle,
        promotionCodeId: promo?.promotionCodeId,
        promo: promoMeta,
      });

    subscription.stripeSubscriptionId = subscriptionId;
    await this.subscriptionRepository.save(subscription);

    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CHECKOUT,
      data: {
        clientSecret,
        publishableKey,
        plan: this.toPlanResponse(plan),
        pricing,
      },
    };
  }

  async confirmCheckout(
    organizationId: string,
    planSlug: PlanSlug,
    billingCycleInput?: BillingCycleSlug,
  ) {
    const resolvedSlug = resolveCheckoutPlanSlug(
      planSlug,
      billingCycleInput,
    ) as PlanSlug;
    const plan = await this.getPlanBySlug(resolvedSlug);
    const planBillingCycle = resolveBillingCycleFromPlan(plan);
    const subscription = await this.getOrCreateSubscription(organizationId);

    if (!this.stripeService.isConfigured()) {
      throw new BadRequestException("Stripe is not configured");
    }

    const stripe = this.stripeService.getClient();
    let stripeSub: Stripe.Subscription | null = null;

    for (let attempt = 0; attempt < 12; attempt++) {
      stripeSub = await this.findConfirmedStripeSubscription(
        stripe,
        subscription,
        plan,
      );
      if (stripeSub) {
        break;
      }

      if (attempt < 11) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!stripeSub) {
      throw new BadRequestException(
        "Payment is still processing. Please try again in a moment.",
      );
    }

    if (subscription.pendingDowngradeStatus) {
      await this.clearPendingDowngradeOnStripe(subscription);
      this.clearPendingDowngrade(subscription);
    }

    await this.applyStripeSubscription(
      subscription,
      plan,
      stripeSub,
      planBillingCycle,
    );
    await this.subscriptionRepository.save(subscription);

    const result = await this.getOrganizationSubscription(organizationId);
    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CONFIRMED,
      data: result.data,
    };
  }

  async changePlan(organizationId: string, planSlug: PlanSlug) {
    const targetPlan = await this.getPlanBySlug(planSlug);
    const subscription = await this.getOrCreateSubscription(organizationId);
    const previousPlanName = subscription.plan.name;

    if (subscription.plan.slug === planSlug) {
      throw new BadRequestException("Already on this plan");
    }

    if (getPlanTierSlug(planSlug) === getPlanTierSlug(PlanSlug.FREE)) {
      if (this.stripeService.isConfigured()) {
        const stripeSubscriptionId =
          await this.resolveStripeSubscriptionId(subscription);

        if (!stripeSubscriptionId) {
          throw new BadRequestException(
            "No active Stripe subscription found to downgrade",
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
        this.setPendingDowngrade(
          subscription,
          targetPlan,
          subscription.currentPeriodEnd,
        );
        await this.subscriptionRepository.save(subscription);

        return {
          message: `Downgrade to ${targetPlan.name} scheduled for ${this.formatScheduledChangeDate(subscription.currentPeriodEnd)}`,
          data: this.toSubscriptionResponse(subscription),
        };
      }

      subscription.planId = targetPlan.id;
      subscription.plan = targetPlan;
      subscription.stripeSubscriptionId = null;
      subscription.subscriptionStatus = SubscriptionStatus.ACTIVE;
      subscription.canceledAt = null;
      this.clearSubscriptionPromo(subscription, targetPlan);
      subscription.currentPeriodEnd = null;
      this.clearPendingDowngrade(subscription);

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

    if (comparePlanTiers(targetPlan.slug, subscription.plan.slug) < 0) {
      if (this.stripeService.isConfigured()) {
        const stripeSubscriptionId =
          await this.resolveStripeSubscriptionId(subscription);

        if (!stripeSubscriptionId) {
          throw new BadRequestException(
            "No active Stripe subscription found to downgrade",
          );
        }

        const priceId = targetPlan.stripePriceId;

        if (!priceId) {
          throw new BadRequestException(
            "Stripe price ID is not configured for this plan",
          );
        }

        subscription.stripeSubscriptionId = stripeSubscriptionId;
        const stripeSub =
          await this.stripeService.scheduleSubscriptionDowngrade({
            stripeSubscriptionId,
            newPriceId: priceId,
            organizationId,
            currentPlanSlug: subscription.plan.slug,
            pendingPlanSlug: planSlug,
          });

        const periodItem = stripeSub.items.data[0];
        subscription.currentPeriodEnd =
          periodItem?.current_period_end ?? subscription.currentPeriodEnd;
        this.setPendingDowngrade(
          subscription,
          targetPlan,
          subscription.currentPeriodEnd,
        );
        await this.subscriptionRepository.save(subscription);

        return {
          message: `Downgrade to ${targetPlan.name} scheduled for ${this.formatScheduledChangeDate(subscription.currentPeriodEnd)}`,
          data: this.toSubscriptionResponse(subscription),
        };
      }
    }

    throw new BadRequestException(
      "Paid plan changes require Stripe checkout. Use the upgrade action.",
    );
  }

  async cancelSubscription(organizationId: string, reason: string) {
    const subscription = await this.getOrCreateSubscription(organizationId);
    const previousPlanName = subscription.plan.name;
    const cancellationReason = reason.trim();

    if (!cancellationReason) {
      throw new BadRequestException("Cancellation reason is required");
    }

    if (subscription.plan.slug === PlanSlug.FREE) {
      throw new BadRequestException("Free plan cannot be canceled");
    }

    const freePlan = await this.getPlanBySlug(PlanSlug.FREE);

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
      subscription.cancellationReason = cancellationReason;
      this.setPendingDowngrade(
        subscription,
        freePlan,
        subscription.currentPeriodEnd,
      );
      await this.subscriptionRepository.save(subscription);

      const endDate = this.formatScheduledChangeDate(
        subscription.currentPeriodEnd,
      );

      this.notificationService.notifySubscriptionCanceled({
        organizationId,
        planName: previousPlanName,
      });

      return {
        message: `Subscription canceled. You will keep ${previousPlanName} access until ${endDate}. No further payments will be charged.`,
        data: this.toSubscriptionResponse(subscription),
      };
    }

    this.clearPendingDowngrade(subscription);
    subscription.planId = freePlan.id;
    subscription.plan = freePlan;
    subscription.stripeSubscriptionId = null;
    subscription.subscriptionStatus = SubscriptionStatus.CANCELED;
    subscription.canceledAt = dayjs().unix();
    this.clearSubscriptionPromo(subscription, freePlan);
    subscription.currentPeriodEnd = null;
    subscription.cancellationReason = cancellationReason;

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

  async cancelPendingDowngrade(organizationId: string) {
    const subscription = await this.getOrCreateSubscription(organizationId);

    if (
      subscription.pendingDowngradeStatus !== PendingDowngradeStatus.SCHEDULED
    ) {
      throw new BadRequestException("No scheduled plan change to cancel");
    }

    await this.clearPendingDowngradeOnStripe(subscription);
    this.clearPendingDowngrade(subscription);
    subscription.canceledAt = null;
    await this.subscriptionRepository.save(subscription);

    const updated = await this.subscriptionRepository.findOneOrFail({
      where: { id: subscription.id },
      relations: { plan: true, pendingPlan: true },
    });

    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.PENDING_DOWNGRADE_CANCELED,
      data: this.toSubscriptionResponse(updated),
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

  private isConfirmedStripeSubscription(
    stripeSub: Stripe.Subscription,
    plan: PlanEntity,
  ): boolean {
    if (!this.stripeSubscriptionMatchesPlan(stripeSub, plan)) {
      return false;
    }

    if (stripeSub.status === "active" || stripeSub.status === "trialing") {
      return true;
    }

    const invoice = stripeSub.latest_invoice;
    return (
      typeof invoice === "object" &&
      invoice !== null &&
      invoice.status === "paid"
    );
  }

  private async findConfirmedStripeSubscription(
    stripe: Stripe,
    subscription: SubscriptionEntity,
    plan: PlanEntity,
  ): Promise<Stripe.Subscription | null> {
    if (subscription.stripeSubscriptionId) {
      const retrieved = await stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
        { expand: ["latest_invoice"] },
      );
      if (this.isConfirmedStripeSubscription(retrieved, plan)) {
        return retrieved;
      }
    }

    if (!subscription.stripeCustomerId) {
      return null;
    }

    const result = await stripe.subscriptions.list({
      customer: subscription.stripeCustomerId,
      limit: 20,
      expand: ["data.latest_invoice"],
    });

    return (
      result.data.find((item) =>
        this.isConfirmedStripeSubscription(item, plan),
      ) ?? null
    );
  }

  private async createCheckoutSessionWithoutPromo(input: {
    organizationId: string;
    subscription: SubscriptionEntity;
    plan: PlanEntity;
    planBillingCycle: BillingCycleSlug;
    priceId: string;
    customerId: string;
    publishableKey: string;
    startPayment: boolean;
  }) {
    const {
      organizationId,
      subscription,
      plan,
      planBillingCycle,
      priceId,
      customerId,
      publishableKey,
      startPayment,
    } = input;
    const defaultPricing = this.buildPlanPricing(plan);

    if (
      subscription.stripeSubscriptionId &&
      this.stripeService.isConfigured()
    ) {
      const stripe = this.stripeService.getClient();
      const existingStripeSub = await stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
      );

      if (existingStripeSub.status === "incomplete") {
        const removed =
          await this.stripeService.removePromotionFromSubscription({
            stripeSubscriptionId: subscription.stripeSubscriptionId,
          });
        if (!removed.clientSecret) {
          throw new BadRequestException("Failed to remove promo code");
        }
        return {
          message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CHECKOUT,
          data: {
            clientSecret: removed.clientSecret,
            publishableKey,
            plan: this.toPlanResponse(plan),
            pricing: removed.pricing,
          },
        };
      }
    }

    const isPaidUpgrade =
      getPlanTierSlug(subscription.plan.slug) !==
        getPlanTierSlug(PlanSlug.FREE) &&
      comparePlanTiers(plan.slug, subscription.plan.slug) > 0;

    if (isPaidUpgrade && this.stripeService.isConfigured() && !startPayment) {
      const stripeSubscriptionId =
        await this.resolveStripeSubscriptionId(subscription);

      if (stripeSubscriptionId) {
        const pricing = await this.stripeService.previewProratedUpgrade({
          stripeSubscriptionId,
          priceId,
        });
        const paymentMethod =
          await this.stripeService.getCustomerPaymentMethodSummary(
            customerId,
            stripeSubscriptionId,
          );

        return {
          message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CHECKOUT,
          data: {
            clientSecret: null,
            publishableKey,
            plan: this.toPlanResponse(plan),
            proratedUpgrade: true,
            amountDue: pricing.total,
            immediate: false,
            paymentMethod,
            pricing,
          },
        };
      }
    }

    const { clientSecret, subscriptionId, pricing } =
      await this.stripeService.createSubscriptionPayment({
        customerId,
        priceId,
        organizationId,
        planSlug: plan.slug,
        billingCycle: planBillingCycle,
      });

    subscription.stripeSubscriptionId = subscriptionId;
    await this.subscriptionRepository.save(subscription);

    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CHECKOUT,
      data: {
        clientSecret,
        publishableKey,
        plan: this.toPlanResponse(plan),
        pricing: pricing ?? defaultPricing,
      },
    };
  }

  private buildPlanPricing(
    plan: PlanEntity,
    promo?: { code: string; label: string },
    totalOverride?: number,
  ): CheckoutPricing {
    const subtotal = getPlanPrice(plan);
    const total = totalOverride ?? subtotal;
    return {
      subtotal,
      discount: Math.max(0, subtotal - total),
      total,
      promoCode: promo?.code,
      promoLabel: promo?.label,
    };
  }

  private stripeSubscriptionMatchesPlan(
    stripeSub: Stripe.Subscription,
    plan: PlanEntity,
  ): boolean {
    if ((stripeSub.metadata?.planSlug as PlanSlug | undefined) === plan.slug) {
      return true;
    }

    const price = stripeSub.items.data[0]?.price;
    const priceId = typeof price === "string" ? price : price?.id;
    return !!priceId && collectPlanStripePriceIds(plan).includes(priceId);
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
      relations: { plan: true, pendingPlan: true },
    });
  }

  private async getOrCreateSubscription(
    organizationId: string,
  ): Promise<SubscriptionEntity> {
    let subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: EntityStatus.ACTIVE },
      relations: { plan: true, pendingPlan: true },
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

  private clearSubscriptionPromo(
    subscription: SubscriptionEntity,
    plan: PlanEntity,
  ): void {
    const amount = getPlanPrice(plan);
    subscription.promoCode = null;
    subscription.stripePromotionCodeId = null;
    subscription.billingListAmount = amount;
    subscription.billingDiscountAmount = 0;
    subscription.billingAmount = amount;
  }

  private async syncSubscriptionBilling(
    subscription: SubscriptionEntity,
    plan: PlanEntity,
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const planAmount = getPlanPrice(plan);

    if (!this.stripeService.isConfigured()) {
      this.clearSubscriptionPromo(subscription, plan);
      return;
    }

    try {
      const billing = await this.stripeService.resolveSubscriptionBilling(
        stripeSub.id,
        planAmount,
      );
      subscription.billingListAmount = billing.listAmount;
      subscription.billingDiscountAmount = billing.discountAmount;
      subscription.billingAmount = billing.billingAmount;
      subscription.promoCode = billing.promoCode;
      subscription.stripePromotionCodeId = billing.stripePromotionCodeId;
    } catch {
      this.clearSubscriptionPromo(subscription, plan);
    }
  }

  private async applyStripeSubscription(
    subscription: SubscriptionEntity,
    plan: PlanEntity,
    stripeSub: Stripe.Subscription,
    billingCycleInput?: BillingCycleSlug,
  ): Promise<void> {
    const billingCycle = billingCycleInput ?? resolveBillingCycleFromPlan(plan);
    const periodItem = stripeSub.items.data[0];

    subscription.planId = plan.id;
    subscription.plan = plan;
    subscription.stripeSubscriptionId = stripeSub.id;
    subscription.subscriptionStatus = this.mapStripeStatus(stripeSub.status);
    subscription.billingCycle = billingCycle;
    await this.syncSubscriptionBilling(subscription, plan, stripeSub);
    subscription.currentPeriodStart = periodItem?.current_period_start ?? null;
    subscription.currentPeriodEnd = periodItem?.current_period_end ?? null;
    subscription.canceledAt = stripeSub.canceled_at;
    this.clearPendingDowngrade(subscription);
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
      this.clearPendingDowngrade(subscription);
      await this.applyStripeSubscription(subscription, plan, stripeSub);
    } else {
      this.clearPendingDowngrade(subscription);
      subscription.planId = plan.id;
      subscription.plan = plan;
      subscription.subscriptionStatus = SubscriptionStatus.ACTIVE;
      subscription.billingCycle = BillingCycleSlug.MONTHLY;
      this.clearSubscriptionPromo(subscription, plan);
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
      relations: { plan: true, pendingPlan: true },
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
        subscription.billingCycle = resolveBillingCycleFromPlan(plan);
        await this.syncSubscriptionBilling(subscription, plan, stripeSub);
      }
    }

    const periodItem = stripeSub.items.data[0];
    subscription.currentPeriodStart = periodItem?.current_period_start ?? null;
    subscription.currentPeriodEnd = periodItem?.current_period_end ?? null;
    subscription.canceledAt = stripeSub.cancel_at_period_end
      ? stripeSub.cancel_at
      : null;

    const pendingPlanSlug = this.getStripePendingPlanSlug(stripeSub);

    if (pendingPlanSlug) {
      const pendingPlan = await this.getPlanBySlug(pendingPlanSlug);
      if (subscription.planId !== pendingPlan.id) {
        this.setPendingDowngrade(
          subscription,
          pendingPlan,
          subscription.currentPeriodEnd,
        );
      } else {
        this.clearPendingDowngrade(subscription);
      }
    } else if (
      subscription.pendingDowngradeStatus ===
        PendingDowngradeStatus.SCHEDULED &&
      subscription.pendingPlanId &&
      subscription.planId === subscription.pendingPlanId
    ) {
      this.clearPendingDowngrade(subscription);
    } else if (
      subscription.pendingDowngradeStatus === PendingDowngradeStatus.SCHEDULED
    ) {
      this.clearPendingDowngrade(subscription);
    }

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
      relations: { plan: true, pendingPlan: true },
    });

    if (!subscription) {
      return;
    }

    const freePlan = await this.getPlanBySlug(PlanSlug.FREE);
    this.clearPendingDowngrade(subscription);
    subscription.planId = freePlan.id;
    subscription.plan = freePlan;
    subscription.stripeSubscriptionId = null;
    subscription.subscriptionStatus = SubscriptionStatus.CANCELED;
    subscription.canceledAt = dayjs().unix();
    this.clearSubscriptionPromo(subscription, freePlan);
    subscription.currentPeriodEnd = null;
    this.clearPendingDowngrade(subscription);

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
