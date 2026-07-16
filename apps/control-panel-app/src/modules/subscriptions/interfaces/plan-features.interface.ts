import { PlanTierSlug } from "../enums/plan-slug.enum";

export type PlanLimitValue = number | "unlimited";

export type McpAccess = "none" | "read" | "full";

export type SupportTier = "community" | "email" | "priority" | "dedicated";

export interface PlanFeatures {
  serverLimit: PlanLimitValue;
  teams: PlanLimitValue;
  teamMembers: PlanLimitValue;
  rbac: boolean;
  mcpAccess: McpAccess;
  support: SupportTier;
  customDomain?: boolean;
  auditLogs?: boolean;
  sso?: boolean;
  ldap?: boolean;
  inheritsFrom?: PlanTierSlug;
}

export type PlanFeatureDisplayRow = {
  key: string;
  label: string;
  value: string;
  accent?: boolean;
  includes?: boolean;
};
