import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { In, Repository } from "typeorm";
import dayjs from "dayjs";
import type Stripe from "stripe";
import { PlanEntity } from "../entities/plan.entity";
import { PlanTranslationEntity } from "../entities/plan-translation.entity";
import planLocaleCatalog from "../../../../plans/locale.json";
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
  getPlanTranslationKey,
  hasMcpAccess,
  normalizePlanFeatures,
} from "../utils/plan-features.util";
import { normalizePlanLocale } from "../utils/plan-locale.util";
import {
  collectPlanStripePriceIds,
  getPlanPrice,
  normalizeBillingCycleSlug,
  resolveBillingCycleFromPlan,
  resolvePlanStripePriceId,
} from "../utils/billing.util";
import {
  getPlanTierSlug,
  isPaidPlanUpgrade,
  isScheduledPlanDowngrade,
  resolveCheckoutPlanSlug,
} from "../utils/plan-slug.util";
import { buildInvoiceRecords, InvoiceRecord } from "../utils/invoice.util";
import { readIsCloudVersionFromEnv } from "@control-panel/modules/server-connections/utils/cloud-version.util";

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
    @InjectRepository(PlanTranslationEntity)
    private readonly planTranslationRepository: Repository<PlanTranslationEntity>,
    @InjectRepository(BillingCycleEntity)
    private readonly billingCycleRepository: Repository<BillingCycleEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepository: Repository<SubscriptionEntity>,
    private readonly stripeService: StripeService,
    private readonly notificationService: SubscriptionNotificationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Loads plan translations for the given plan IDs in the requested locale.
   * @param planIds - IDs of the plans to load translations for.
   * @param locale - Locale code to load translations in.
   * @returns Map of plan ID to its translation row for the requested locale.
   */
  private async loadPlanTranslations(
    planIds: string[],
    locale: string,
  ): Promise<Map<string, PlanTranslationEntity>> {
    if (planIds.length === 0) {
      return new Map();
    }

    try {
      const translations = await this.planTranslationRepository.find({
        where: { locale, planId: In(planIds) },
      });

      return new Map(
        translations.map((translation) => [translation.planId, translation]),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to load plan translations: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Maps a plan entity to its API response, resolving the localized name,
   * description, feature rows, and server badge for the requested locale.
   * @param plan - The plan entity to map.
   * @param locale - Locale code used to resolve catalog content (defaults to "en").
   * @param translation - Optional stored translation overriding catalog content.
   * @returns The localized plan response.
   */
  private toPlanResponse(
    plan: PlanEntity,
    locale: string = "en",
    translation?: PlanTranslationEntity,
  ): PlanResponse {
    const planFeatures = normalizePlanFeatures(undefined, plan.slug);
    const catalog = planLocaleCatalog as Record<
      string,
      {
        plans: Record<string, { name: string; description: string }>;
        features: Record<string, string>;
      }
    >;
    const localeContent = catalog[locale] ?? catalog.en;
    const planContent = localeContent.plans[getPlanTranslationKey(plan.slug)];
    const inheritedPlanName = planFeatures.inheritsFrom
      ? localeContent.plans[getPlanTranslationKey(planFeatures.inheritsFrom)]
          ?.name
      : undefined;
    const features = localeContent.features;

    return {
      id: plan.id,
      slug: plan.slug,
      tierSlug: plan.tierSlug ?? getPlanTierSlug(plan.slug),
      billingCycle: resolveBillingCycleFromPlan(plan),
      name: translation?.name ?? planContent?.name ?? plan.tierSlug,
      description: translation?.description ?? planContent?.description ?? null,
      price: Number(plan.price) || 0,
      listPrice: plan.listPrice == null ? null : Number(plan.listPrice) || 0,
      features: planFeatures,
      featureRows: getPlanFeatureRows(
        plan.slug,
        planFeatures,
        features,
        inheritedPlanName,
      ),
      serverBadge: getPlanServerBadge(planFeatures, plan.slug, features),
      sortOrder: plan.sortOrder,
    };
  }

  /**
   * Maps a subscription entity to its API response, including plan details,
   * pending downgrade information, and billing amounts.
   * @param subscription - The subscription entity to map.
   * @param locale - Locale code used for localized plan content (defaults to "en").
   * @param translations - Preloaded plan translations keyed by plan ID.
   * @returns The subscription response.
   */
  private toSubscriptionResponse(
    subscription: SubscriptionEntity,
    locale: string = "en",
    translations: Map<string, PlanTranslationEntity> = new Map(),
  ): SubscriptionResponse {
    const hasPending =
      subscription.pendingDowngradeStatus ===
        PendingDowngradeStatus.SCHEDULED && subscription.pendingPlan;

    return {
      id: subscription.id,
      plan: this.toPlanResponse(
        subscription.plan,
        locale,
        translations.get(subscription.plan.id),
      ),
      pendingPlan: hasPending
        ? this.toPlanResponse(
            subscription.pendingPlan!,
            locale,
            translations.get(subscription.pendingPlan!.id),
          )
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

  /**
   * Formats a Unix timestamp as a human-readable scheduled-change date.
   * @param unix - Unix timestamp in seconds, or null when unscheduled.
   * @returns The formatted date, or a fallback phrase when null.
   */
  private formatScheduledChangeDate(unix: number | null): string {
    if (!unix) return "the next billing cycle";
    return dayjs.unix(unix).format("MMMM D, YYYY");
  }

  /**
   * Marks a subscription as having a downgrade scheduled to the target plan.
   * @param subscription - The subscription entity to update.
   * @param targetPlan - The plan the subscription will downgrade to.
   * @param effectiveAt - Unix timestamp (seconds) when the downgrade takes effect.
   */
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

  /**
   * Removes any scheduled downgrade state from the subscription entity.
   * @param subscription - The subscription entity to update.
   */
  private clearPendingDowngrade(subscription: SubscriptionEntity): void {
    subscription.pendingPlanId = null;
    subscription.pendingPlan = null;
    subscription.pendingEffectiveAt = null;
    subscription.pendingDowngradeStatus = null;
  }

  /**
   * Cancels any scheduled downgrade changes on the matching Stripe subscription.
   * No-op when Stripe is not configured or no Stripe subscription exists.
   * @param subscription - The subscription whose Stripe changes should be cleared.
   */
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

  /**
   * Extracts the pending plan slug from a Stripe subscription's metadata.
   * @param stripeSub - The Stripe subscription to read metadata from.
   * @returns The pending plan slug, or null when not present.
   */
  private getStripePendingPlanSlug(
    stripeSub: Stripe.Subscription,
  ): PlanSlug | null {
    const slug = stripeSub.metadata?.pendingPlanSlug?.trim();
    if (!slug) {
      return null;
    }
    return slug as PlanSlug;
  }

  /**
   * Resolves the local plan entity matching a Stripe subscription, by price ID
   * first and then by the planSlug metadata fallback.
   * @param stripeSub - The Stripe subscription to resolve.
   * @returns The matching plan entity, or null when no match is found.
   */
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

  /**
   * Finds the plan entity owning a Stripe price ID, checking the legacy
   * stripePriceId column before scanning active plans' price collections.
   * @param priceId - The Stripe price ID to look up.
   * @returns The matching plan entity, or null when not found.
   */
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

  /**
   * Maps a billing cycle entity to its API response.
   * @param cycle - The billing cycle entity to map.
   * @returns The billing cycle response.
   */
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

  /**
   * Fetches a plan by its slug.
   * @param slug - The plan slug to look up.
   * @returns The matching plan entity.
   * @throws NotFoundException when no plan exists for the slug.
   */
  async getPlanBySlug(slug: PlanSlug): Promise<PlanEntity> {
    try {
      const plan = await this.planRepository.findOne({ where: { slug } });
      if (!plan) {
        throw new NotFoundException(`Plan "${slug}" not found`);
      }
      return plan;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to fetch plan "${slug}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Lists all active plans and billing cycles with localized content.
   * @param locale - Optional locale code for translations.
   * @returns Plans and billing cycles formatted for display.
   */
  async listPlans(locale?: string) {
    try {
      const resolvedLocale = normalizePlanLocale(locale);
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

      const translations = await this.loadPlanTranslations(
        plans.map((p) => p.id),
        resolvedLocale,
      );

      return {
        message: SUCCESS_MESSAGES.SUBSCRIPTIONS.PLANS,
        data: {
          plans: plans.map((plan) =>
            this.toPlanResponse(
              plan,
              resolvedLocale,
              translations.get(plan.id),
            ),
          ),
          billingCycles: billingCycles.map((cycle) =>
            this.toBillingCycleResponse(cycle),
          ),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to list plans: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns the organization's active subscription synced with Stripe,
   * including the payment method summary when available.
   * @param organizationId - ID of the organization.
   * @param locale - Optional locale code for translations.
   * @returns The current subscription response.
   * @throws NotFoundException when no active subscription exists.
   */
  async getOrganizationSubscription(organizationId: string, locale?: string) {
    try {
      const resolvedLocale = normalizePlanLocale(locale);
      let subscription = await this.subscriptionRepository.findOne({
        where: { organizationId, status: EntityStatus.ACTIVE },
        relations: { plan: true, pendingPlan: true },
        order: { createdAt: "DESC" },
      });

      if (!subscription) {
        throw new NotFoundException("No active subscription found");
      }

      subscription = await this.syncSubscriptionFromStripe(subscription);

      const planIds = [
        subscription.plan?.id,
        subscription.pendingPlan?.id,
      ].filter((id): id is string => id != null);

      const translations = await this.loadPlanTranslations(
        planIds,
        resolvedLocale,
      );

      const response = this.toSubscriptionResponse(
        subscription,
        resolvedLocale,
        translations,
      );
      let paymentMethod: SubscriptionResponse["paymentMethod"] = null;

      if (subscription.stripeCustomerId && this.stripeService.isConfigured()) {
        try {
          paymentMethod =
            await this.stripeService.getCustomerPaymentMethodSummary(
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
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to load subscription: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Builds invoice records for the organization's active subscription.
   * @param organizationId - ID of the organization.
   * @param customerName - Fallback customer name when the org name is missing.
   * @param customerEmail - Customer email used on the invoice records.
   * @returns Invoice records for display.
   * @throws NotFoundException when no active subscription exists.
   */
  async listOrganizationInvoices(
    organizationId: string,
    customerName: string,
    customerEmail: string,
  ): Promise<{ message: string; data: InvoiceRecord[] }> {
    try {
      const subscription = await this.subscriptionRepository.findOne({
        where: { organizationId, status: EntityStatus.ACTIVE },
        relations: { plan: true, organization: true },
        order: { createdAt: "DESC" },
      });

      if (!subscription) {
        throw new NotFoundException("No active subscription found");
      }

      const organizationName =
        subscription.organization?.name ?? customerName ?? customerEmail;

      return {
        message: SUCCESS_MESSAGES.SUBSCRIPTIONS.INVOICES,
        data: buildInvoiceRecords({
          subscription,
          customerName: customerName || organizationName,
          customerEmail,
          organizationName,
        }),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to list invoices: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolves the effective plan features for an organization, creating a free
   * subscription first when none exists.
   * @param organizationId - ID of the organization.
   * @returns The normalized plan features.
   */
  async getOrganizationPlanFeatures(
    organizationId: string,
  ): Promise<PlanFeatures> {
    try {
      const subscription = await this.getOrCreateSubscription(organizationId);
      return normalizePlanFeatures(undefined, subscription.plan.slug);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to load plan features: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensures the organization's plan includes the required MCP access level.
   * Cloud (`IS_CLOUD_VERSION=true`) enforces plan-based MCP access;
   * self-host grants access regardless of plan.
   * @param organizationId - ID of the organization.
   * @param required - Minimum MCP access level required (defaults to "read").
   * @throws ForbiddenException when the plan lacks the required access.
   */
  async assertMcpAccess(
    organizationId: string,
    required: McpAccess = "read",
  ): Promise<void> {
    try {
      if (!this.isCloudVersion()) {
        return;
      }

      const features = await this.getOrganizationPlanFeatures(organizationId);

      if (!hasMcpAccess(features, required)) {
        throw new ForbiddenException(
          "Your plan does not include MCP server access",
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to verify MCP access: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Cloud (`IS_CLOUD_VERSION=true`) enforces plan-based MCP access.
   * Self-host grants MCP access regardless of plan.
   */
  private isCloudVersion(): boolean {
    return readIsCloudVersionFromEnv((key) =>
      this.configService.get<string>(key),
    );
  }

  /**
   * Creates an active free-plan subscription for an organization, optionally
   * creating a Stripe customer when an email and Stripe config are available.
   * @param input - Organization ID plus optional customer email and name.
   * @returns The persisted free subscription entity.
   */
  async createFreeSubscription(input: {
    organizationId: string;
    email?: string;
    name?: string;
  }): Promise<SubscriptionEntity> {
    try {
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

      return await this.subscriptionRepository.save(subscription);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to create free subscription: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Creates a Stripe checkout session (or prorated upgrade intent) for the
   * given plan, handling promo codes, incomplete sessions, and upgrades.
   * @param organizationId - ID of the organization checking out.
   * @param planSlug - Target plan slug.
   * @param userEmail - Email of the purchasing user.
   * @param userName - Display name of the purchasing user.
   * @param startPayment - When true, charges a prorated upgrade immediately.
   * @param billingCycleInput - Optional billing cycle override.
   * @param promoCodeInput - Optional promo code to apply.
   * @param removePromo - When true, removes an applied promo code instead.
   * @returns Checkout payload with client secret, pricing, and plan details.
   * @throws BadRequestException when the plan, Stripe config, or promo is invalid.
   */
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
    try {
      return await this.buildCheckoutSession(
        organizationId,
        planSlug,
        userEmail,
        userName,
        startPayment,
        billingCycleInput,
        promoCodeInput,
        removePromo,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to create checkout session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Builds the checkout session payload for
   * {@link SubscriptionService.createCheckoutSession}.
   * @param organizationId - ID of the organization checking out.
   * @param planSlug - Target plan slug.
   * @param userEmail - Email of the purchasing user.
   * @param userName - Display name of the purchasing user.
   * @param startPayment - When true, charges a prorated upgrade immediately.
   * @param billingCycleInput - Optional billing cycle override.
   * @param promoCodeInput - Optional promo code to apply.
   * @param removePromo - When true, removes an applied promo code instead.
   * @returns Checkout payload with client secret, pricing, and plan details.
   */
  private async buildCheckoutSession(
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

    const isPaidUpgrade = isPaidPlanUpgrade(subscription.plan.slug, plan.slug);

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

  /**
   * Confirms a checkout by polling Stripe until the subscription is confirmed,
   * then applying the purchased plan to the local subscription.
   * @param organizationId - ID of the organization.
   * @param planSlug - Plan slug that was checked out.
   * @param billingCycleInput - Optional billing cycle override.
   * @param locale - Optional locale code for translations.
   * @returns The confirmed subscription response.
   * @throws BadRequestException when Stripe is unconfigured or payment is still processing.
   */
  async confirmCheckout(
    organizationId: string,
    planSlug: PlanSlug,
    billingCycleInput?: BillingCycleSlug,
    locale?: string,
  ) {
    try {
      return await this.finalizeCheckoutConfirmation(
        organizationId,
        planSlug,
        billingCycleInput,
        locale,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to confirm checkout: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Polls Stripe for the confirmed subscription and applies it for
   * {@link SubscriptionService.confirmCheckout}.
   * @param organizationId - ID of the organization.
   * @param planSlug - Plan slug that was checked out.
   * @param billingCycleInput - Optional billing cycle override.
   * @param locale - Optional locale code for translations.
   * @returns The confirmed subscription response.
   */
  private async finalizeCheckoutConfirmation(
    organizationId: string,
    planSlug: PlanSlug,
    billingCycleInput?: BillingCycleSlug,
    locale?: string,
  ) {
    const resolvedLocale = normalizePlanLocale(locale);
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

    const result = await this.getOrganizationSubscription(
      organizationId,
      resolvedLocale,
    );
    return {
      message: SUCCESS_MESSAGES.SUBSCRIPTIONS.CONFIRMED,
      data: result.data,
    };
  }

  /**
   * Changes the organization's plan. Free downgrades apply immediately (or
   * schedule cancellation via Stripe), paid downgrades schedule a Stripe price
   * change at period end, and upgrades require checkout.
   * @param organizationId - ID of the organization.
   * @param planSlug - Target plan slug.
   * @param locale - Optional locale code for translations.
   * @returns The updated subscription response.
   * @throws BadRequestException when the change is invalid or Stripe state is missing.
   */
  async changePlan(
    organizationId: string,
    planSlug: PlanSlug,
    locale?: string,
  ) {
    try {
      return await this.applyPlanChangeRequest(
        organizationId,
        planSlug,
        locale,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to change plan: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Applies the plan change request for
   * {@link SubscriptionService.changePlan}.
   * @param organizationId - ID of the organization.
   * @param planSlug - Target plan slug.
   * @param locale - Optional locale code for translations.
   * @returns The updated subscription response.
   */
  private async applyPlanChangeRequest(
    organizationId: string,
    planSlug: PlanSlug,
    locale?: string,
  ) {
    const resolvedLocale = normalizePlanLocale(locale);
    const targetPlan = await this.getPlanBySlug(planSlug);
    const subscription = await this.getOrCreateSubscription(organizationId);
    const previousPlanName = subscription.plan.tierSlug;

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
          message: `Downgrade to ${targetPlan.tierSlug} scheduled for ${this.formatScheduledChangeDate(subscription.currentPeriodEnd)}`,
          data: this.toSubscriptionResponse(subscription, resolvedLocale),
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
        newPlan: targetPlan.tierSlug,
      });

      return {
        message: SUCCESS_MESSAGES.SUBSCRIPTIONS.PLAN_CHANGED,
        data: this.toSubscriptionResponse(subscription, resolvedLocale),
      };
    }

    if (isScheduledPlanDowngrade(subscription.plan.slug, targetPlan.slug)) {
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
          message: `Downgrade to ${targetPlan.tierSlug} scheduled for ${this.formatScheduledChangeDate(subscription.currentPeriodEnd)}`,
          data: this.toSubscriptionResponse(subscription, resolvedLocale),
        };
      }
    }

    throw new BadRequestException(
      "Paid plan changes require Stripe checkout. Use the upgrade action.",
    );
  }

  /**
   * Cancels the organization's paid subscription at period end via Stripe, or
   * immediately downgrades to the free plan when Stripe is not configured.
   * @param organizationId - ID of the organization.
   * @param reason - Cancellation reason provided by the user.
   * @param locale - Optional locale code for translations.
   * @returns The canceled subscription response.
   * @throws BadRequestException when the reason is empty, the plan is free,
   *   or no Stripe subscription exists to cancel.
   */
  async cancelSubscription(
    organizationId: string,
    reason: string,
    locale?: string,
  ) {
    try {
      return await this.applySubscriptionCancellation(
        organizationId,
        reason,
        locale,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to cancel subscription: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Applies the cancellation for {@link SubscriptionService.cancelSubscription}.
   * @param organizationId - ID of the organization.
   * @param reason - Cancellation reason provided by the user.
   * @param locale - Optional locale code for translations.
   * @returns The canceled subscription response.
   */
  private async applySubscriptionCancellation(
    organizationId: string,
    reason: string,
    locale?: string,
  ) {
    const resolvedLocale = normalizePlanLocale(locale);
    const subscription = await this.getOrCreateSubscription(organizationId);
    const previousPlanName = subscription.plan.tierSlug;
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
        data: this.toSubscriptionResponse(subscription, resolvedLocale),
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
      data: this.toSubscriptionResponse(subscription, resolvedLocale),
    };
  }

  /**
   * Cancels a scheduled downgrade, restoring the current plan and clearing
   * pending changes on Stripe.
   * @param organizationId - ID of the organization.
   * @param locale - Optional locale code for translations.
   * @returns The updated subscription response.
   * @throws BadRequestException when no downgrade is scheduled.
   */
  async cancelPendingDowngrade(organizationId: string, locale?: string) {
    try {
      const resolvedLocale = normalizePlanLocale(locale);
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
        data: this.toSubscriptionResponse(updated, resolvedLocale),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to cancel pending downgrade: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Dispatches a verified Stripe webhook event to the matching handler.
   * Unknown event types are ignored; handler failures surface as 500 responses
   * so Stripe retries delivery.
   * @param event - The Stripe event to process.
   * @throws InternalServerErrorException when a handler fails.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    try {
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
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to process webhook event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolves the Stripe subscription ID for a subscription, preferring the
   * stored ID and falling back to an active/trialing/past-due lookup by customer.
   * @param subscription - The subscription entity to resolve against.
   * @returns The Stripe subscription ID, or null when none is found.
   */
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

  /**
   * Checks whether a Stripe subscription is confirmed for the given plan:
   * a matching plan plus an active/trialing status or a paid latest invoice.
   * @param stripeSub - The Stripe subscription to check.
   * @param plan - The plan the subscription must match.
   * @returns True when the subscription is confirmed.
   */
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

  /**
   * Finds a confirmed Stripe subscription for the customer, checking the
   * stored subscription ID first and then listing by Stripe customer.
   * @param stripe - The Stripe client to query.
   * @param subscription - The local subscription entity.
   * @param plan - The plan the Stripe subscription must match.
   * @returns The confirmed Stripe subscription, or null when none is found.
   */
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

  /**
   * Builds a checkout session payload while ignoring any promo code input,
   * handling incomplete subscriptions and prorated upgrade previews.
   * @param input - Checkout context including subscription, plan, price, and customer IDs.
   * @returns Checkout payload with client secret and pricing.
   * @throws BadRequestException when the promo cannot be removed or Stripe state is invalid.
   */
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

    const isPaidUpgrade = isPaidPlanUpgrade(subscription.plan.slug, plan.slug);

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

  /**
   * Builds the pricing summary shown during checkout.
   * @param plan - The plan being purchased.
   * @param promo - Optional applied promotion code and label.
   * @param totalOverride - Optional total replacing the plan price (e.g. prorated amount).
   * @returns The checkout pricing breakdown.
   */
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

  /**
   * Checks whether a Stripe subscription corresponds to the given plan, by
   * metadata slug or by any of the plan's Stripe price IDs.
   * @param stripeSub - The Stripe subscription to check.
   * @param plan - The plan to match against.
   * @returns True when the subscription belongs to the plan.
   */
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

  /**
   * Refreshes a local subscription from Stripe when an active or trialing
   * Stripe subscription exists; otherwise returns it unchanged.
   * @param subscription - The subscription entity to sync.
   * @returns The refreshed subscription entity.
   */
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

  /**
   * Fetches the organization's active subscription, creating a free one first
   * when none exists.
   * @param organizationId - ID of the organization.
   * @returns The active subscription entity.
   */
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

  /**
   * Resets promo-related billing fields on the subscription to the plan's
   * base price.
   * @param subscription - The subscription entity to update.
   * @param plan - The plan providing the base price.
   */
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

  /**
   * Syncs promotional billing fields from Stripe onto the subscription,
   * resetting to base pricing when Stripe is unconfigured or resolution fails.
   * @param subscription - The subscription entity to update.
   * @param plan - The plan providing the base price.
   * @param stripeSub - The Stripe subscription to resolve billing from.
   */
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

  /**
   * Applies a Stripe subscription's state onto the local subscription entity,
   * including plan, status, billing cycle, period, and pending-downgrade reset.
   * @param subscription - The subscription entity to update.
   * @param plan - The plan to assign.
   * @param stripeSub - The Stripe subscription to apply.
   * @param billingCycleInput - Optional billing cycle override.
   */
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

  /**
   * Maps a raw Stripe subscription status to the local status enum.
   * @param status - The raw Stripe status string.
   * @returns The matching local subscription status.
   */
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

  /**
   * Handles `checkout.session.completed` by attaching the purchased plan and
   * Stripe identifiers to the subscription, then notifying the plan change.
   * @param session - The completed Stripe checkout session.
   */
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
      newPlan: plan.tierSlug,
    });
  }

  /**
   * Handles `customer.subscription.updated` by syncing status, plan, billing
   * period, and pending downgrade state, then notifying renewal or plan change.
   * @param stripeSub - The updated Stripe subscription.
   */
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
        previousPlan: previousPlan?.tierSlug ?? "previous",
        newPlan: subscription.plan.tierSlug,
      });
    } else {
      this.notificationService.notifySubscriptionRenewed({
        organizationId,
        planName: subscription.plan.tierSlug,
        renewalDate: subscription.currentPeriodEnd,
      });
    }
  }

  /**
   * Handles `customer.subscription.deleted` by downgrading the subscription to
   * the free plan and notifying cancellation.
   * @param stripeSub - The deleted Stripe subscription.
   */
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
      planName: subscription.plan.tierSlug,
    });
  }

  /**
   * Handles `invoice.paid` by refreshing the subscription from the paid
   * invoice's underlying Stripe subscription.
   * @param invoice - The paid Stripe invoice.
   */
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

  /**
   * Handles `invoice.payment_failed` by marking the subscription past due and
   * notifying the organization.
   * @param invoice - The failed Stripe invoice.
   */
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
      planName: subscription.plan.tierSlug,
    });
  }
}
