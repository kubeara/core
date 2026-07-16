export type SubscriptionBillingDetails = {
  listAmount: number;
  discountAmount: number;
  billingAmount: number;
  promoCode: string | null;
  stripePromotionCodeId: string | null;
};
