export type CheckoutPricing = {
  subtotal: number;
  discount: number;
  total: number;
  promoCode?: string;
  promoLabel?: string;
};
