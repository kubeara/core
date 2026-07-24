export const ZOHO_TICKET_CATEGORIES = {
  SUPPORT: "Support",
  SERVICE_REQUEST: "Service Request",
} as const;

export type ZohoTicketType = "support" | "service_request";

export const ZOHO_TICKET_LOGO_URL = "https://images.kubeara.dev/main_logo.png";

export const ZOHO_TICKET_THEME = {
  outerBackground: "#09090b",
  cardBackground: "#18181b",
  cardBorder: "#27272a",
  sectionLabelColor: "#71717a",
  detailsBorder: "#27272a",
  detailsLabelBackground: "#27272a",
  detailsLabelColor: "#a1a1aa",
  detailsValueColor: "#fafafa",
  emailLinkColor: "#60a5fa",
  contentBackground: "#27272a",
  contentBorder: "#3f3f46",
  contentColor: "#e4e4e7",
  footerBackground: "#09090b",
  footerBorder: "#27272a",
  footerTextColor: "#71717a",
  footerMutedColor: "#52525b",
  socialIconBackground: "#27272a",
  socialIconBorder: "#3f3f46",
} as const;

export const ZOHO_TICKET_TYPE_CONFIG = {
  support: {
    subject: "New Support Request",
    contentLabel: "Message",
  },
  service_request: {
    subject: "New Service Request",
    contentLabel: "Description",
  },
} as const;

export const ZOHO_TICKET_SOCIAL_LINKS = [
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/kubeara",
    iconUrl:
      "https://api.iconify.design/simple-icons/linkedin.svg?color=%23a1a1aa",
  },
  {
    id: "x",
    label: "X",
    href: "https://x.com/kubeara_dev",
    iconUrl: "https://cdn.simpleicons.org/x/a1a1aa",
  },
  {
    id: "discord",
    label: "Discord",
    href: "https://discord.com/invite/kubeara",
    iconUrl: "https://cdn.simpleicons.org/discord/a1a1aa",
  },
  {
    id: "github",
    label: "GitHub",
    href: "https://github.com/kubeara/core",
    iconUrl: "https://cdn.simpleicons.org/github/a1a1aa",
  },
] as const;

export const ZOHO_TICKET_FOOTER = {
  copyrightLine1: "© 2026 Kubeara by IQud Tek LLP",
  copyrightLine2: "All rights reserved",
} as const;
