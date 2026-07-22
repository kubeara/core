export const SUPPORT_TOPICS = [
  "Support",
  "Enterprise",
  "Billing",
  "Privacy",
  "Other",
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
