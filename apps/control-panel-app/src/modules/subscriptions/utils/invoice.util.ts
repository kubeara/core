import dayjs from "dayjs";
import { BillingCycleSlug } from "../enums/billing-cycle.enum";
import { SubscriptionEntity } from "../entities/subscription.entity";
import { SubscriptionStatus } from "../enums/subscription-status.enum";
import { getPlanTierSlug } from "./plan-slug.util";

export const INVOICE_ISSUER_NAME = "Kubera";

export interface DerivedInvoicePeriod {
  periodStart: number;
  periodEnd: number;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  status: "paid" | "open";
  issuedAt: number;
  periodStart: number;
  periodEnd: number;
  planName: string;
  billingCycle: BillingCycleSlug;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  discount: number;
  total: number;
  promoCode: string | null;
  currency: string;
  billTo: {
    name: string;
    email: string;
    organization: string;
  };
  issuer: {
    name: string;
  };
}

function billingCycleMonths(cycle: BillingCycleSlug): number {
  if (cycle === BillingCycleSlug.QUARTERLY) {
    return 3;
  }
  if (cycle === BillingCycleSlug.YEARLY) {
    return 12;
  }
  return 1;
}

function subtractBillingCycle(unix: number, cycle: BillingCycleSlug): number {
  return dayjs.unix(unix).subtract(billingCycleMonths(cycle), "month").unix();
}

function addBillingCycle(unix: number, cycle: BillingCycleSlug): number {
  return dayjs.unix(unix).add(billingCycleMonths(cycle), "month").unix();
}

export function deriveBillingPeriods(
  subscription: SubscriptionEntity,
): DerivedInvoicePeriod[] {
  const cycle = subscription.billingCycle;
  const startedAt = subscription.startedAt;
  const endBound = subscription.canceledAt ?? dayjs().unix();

  if (getPlanTierSlug(subscription.plan.slug) === "free") {
    return [];
  }
  if (Number(subscription.billingAmount) <= 0) {
    return [];
  }

  const periods: DerivedInvoicePeriod[] = [];

  if (subscription.currentPeriodStart && subscription.currentPeriodEnd) {
    let periodEnd = Math.min(subscription.currentPeriodEnd, endBound);
    let periodStart = subscription.currentPeriodStart;

    while (periodStart >= startedAt && periodStart < endBound) {
      periods.push({ periodStart, periodEnd });
      periodEnd = periodStart;
      periodStart = subtractBillingCycle(periodStart, cycle);
    }
  }

  if (periods.length === 0) {
    let cursor = startedAt;
    while (cursor < endBound) {
      const periodEnd = Math.min(addBillingCycle(cursor, cycle), endBound);
      periods.push({ periodStart: cursor, periodEnd });
      cursor = periodEnd;
    }
  }

  return periods
    .filter((period) => period.periodEnd > period.periodStart)
    .sort((a, b) => b.periodStart - a.periodStart);
}

export function buildInvoiceRecords(input: {
  subscription: SubscriptionEntity;
  customerName: string;
  customerEmail: string;
  organizationName: string;
}): InvoiceRecord[] {
  const { subscription, customerName, customerEmail, organizationName } = input;
  const plan = subscription.plan;
  const subtotal =
    Number(subscription.billingListAmount ?? subscription.billingAmount) || 0;
  const discount = Number(subscription.billingDiscountAmount) || 0;
  const total = Number(subscription.billingAmount) || 0;
  const promoCode = subscription.promoCode;
  const now = dayjs().unix();

  return deriveBillingPeriods(subscription).map((period) => {
    const isPaid =
      period.periodEnd <= now ||
      subscription.subscriptionStatus !== SubscriptionStatus.INCOMPLETE;

    return {
      id: `${subscription.id}-${period.periodStart}`,
      invoiceNumber: `INV-${subscription.id.slice(0, 8).toUpperCase()}-${period.periodStart}`,
      status: isPaid ? "paid" : "open",
      issuedAt: period.periodStart,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      planName: plan.name,
      billingCycle: subscription.billingCycle,
      lineItems: [
        {
          description: `${plan.name} subscription`,
          quantity: 1,
          unitAmount: subtotal,
          amount: subtotal,
        },
      ],
      subtotal,
      discount,
      total,
      promoCode,
      currency: "USD",
      billTo: {
        name: customerName,
        email: customerEmail,
        organization: organizationName,
      },
      issuer: { name: INVOICE_ISSUER_NAME },
    };
  });
}
