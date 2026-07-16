import type { BillingCycleSlug } from "@/features/subscriptions/types";

export type InvoiceStatus = "paid" | "open";

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
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
};
