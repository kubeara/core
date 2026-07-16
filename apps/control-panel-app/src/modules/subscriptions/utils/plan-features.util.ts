import { PlanTierSlug } from "../enums/plan-slug.enum";
import { getPlanTierSlug } from "./plan-slug.util";
import {
  McpAccess,
  PlanFeatureDisplayRow,
  PlanFeatures,
  PlanLimitValue,
  SupportTier,
} from "../interfaces/plan-features.interface";

const INHERITS_LABEL: Record<PlanTierSlug, string> = {
  free: "",
  starter: "Starter",
  pro: "Pro",
  max: "Max",
  enterprise: "Enterprise",
};

export const DEFAULT_PLAN_FEATURES: Record<PlanTierSlug, PlanFeatures> = {
  free: {
    serverLimit: 1,
    teams: 1,
    teamMembers: 1,
    rbac: false,
    mcpAccess: "none",
    support: "community",
  },
  starter: {
    serverLimit: 5,
    teams: 2,
    teamMembers: 10,
    rbac: true,
    mcpAccess: "read",
    support: "email",
  },
  pro: {
    serverLimit: 25,
    teams: 5,
    teamMembers: 25,
    rbac: true,
    mcpAccess: "full",
    support: "email",
    customDomain: true,
    inheritsFrom: "starter",
  },
  max: {
    serverLimit: "unlimited",
    teams: "unlimited",
    teamMembers: "unlimited",
    rbac: true,
    mcpAccess: "full",
    support: "priority",
    customDomain: true,
    inheritsFrom: "pro",
  },
  enterprise: {
    serverLimit: "unlimited",
    teams: "unlimited",
    teamMembers: "unlimited",
    rbac: true,
    mcpAccess: "full",
    support: "dedicated",
    customDomain: true,
    auditLogs: true,
    sso: true,
    ldap: true,
    inheritsFrom: "max",
  },
};

function formatLimit(value: PlanLimitValue): string {
  return value === "unlimited" ? "Unlimited" : String(value);
}

function formatBoolean(value: boolean): string {
  return value ? "Yes" : "No";
}

function formatMcpAccess(value: McpAccess): string {
  if (value === "none") return "None";
  if (value === "read") return "Read";
  return "Full";
}

function formatSupport(value: SupportTier): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseLimitToken(raw: string): PlanLimitValue {
  if (raw.toLowerCase() === "unlimited") {
    return "unlimited";
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : "unlimited";
}

function parseLegacyFeatureString(line: string): Partial<PlanFeatures> | null {
  if (line.startsWith("Includes all features of ")) {
    const name = line.replace("Includes all features of ", "").trim();
    const inheritsFrom = (Object.keys(INHERITS_LABEL) as PlanTierSlug[]).find(
      (tier) => INHERITS_LABEL[tier].toLowerCase() === name.toLowerCase(),
    );
    return inheritsFrom ? { inheritsFrom } : null;
  }

  const separator = line.indexOf(": ");
  if (separator === -1) {
    return null;
  }

  const label = line.slice(0, separator).trim().toLowerCase();
  const value = line.slice(separator + 2).trim();

  switch (label) {
    case "teams":
      return { teams: parseLimitToken(value) };
    case "team members":
      return { teamMembers: parseLimitToken(value) };
    case "rbac":
      return { rbac: value.toLowerCase() === "yes" };
    case "mcp server":
      return {
        mcpAccess: value.toLowerCase() as McpAccess,
      };
    case "support":
      return { support: value.toLowerCase() as SupportTier };
    case "custom domain / white labelling":
      return { customDomain: value.toLowerCase() === "yes" };
    case "audit logs":
      return { auditLogs: value.toLowerCase() === "yes" };
    case "sso":
      return { sso: value.toLowerCase() === "yes" };
    case "ldap":
      return { ldap: value.toLowerCase() === "yes" };
    default:
      return null;
  }
}

function isPlanFeaturesObject(value: unknown): value is PlanFeatures {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as PlanFeatures;
  return (
    (typeof candidate.serverLimit === "number" ||
      candidate.serverLimit === "unlimited") &&
    typeof candidate.rbac === "boolean" &&
    typeof candidate.mcpAccess === "string" &&
    typeof candidate.support === "string"
  );
}

export function normalizePlanFeatures(
  raw: unknown,
  slug?: string,
): PlanFeatures {
  const tier = slug ? getPlanTierSlug(slug) : undefined;

  if (isPlanFeaturesObject(raw)) {
    return {
      ...(tier ? DEFAULT_PLAN_FEATURES[tier] : {}),
      ...raw,
    };
  }

  if (Array.isArray(raw) && raw.every((item) => typeof item === "string")) {
    const merged: PlanFeatures = {
      ...(tier ? DEFAULT_PLAN_FEATURES[tier] : DEFAULT_PLAN_FEATURES.free),
    };

    for (const line of raw) {
      const patch = parseLegacyFeatureString(line);
      if (patch) {
        Object.assign(merged, patch);
      }
    }

    return merged;
  }

  if (tier) {
    return DEFAULT_PLAN_FEATURES[tier];
  }

  return DEFAULT_PLAN_FEATURES.free;
}

export function getPlanServerBadge(
  features: PlanFeatures,
  slug: string,
): string {
  const tier = getPlanTierSlug(slug);
  if (tier === "enterprise") {
    return "Unlimited";
  }

  if (features.serverLimit === "unlimited") {
    return "Unlimited servers";
  }

  const count = features.serverLimit;
  return count === 1 ? "1 server" : `${count} servers`;
}

export function getPlanFeatureRows(
  slug: string,
  features: PlanFeatures,
): PlanFeatureDisplayRow[] {
  const row = (
    key: string,
    label: string,
    value: string,
    options?: { accent?: boolean; includes?: boolean },
  ): PlanFeatureDisplayRow => ({
    key,
    label,
    value,
    accent: options?.accent,
    includes: options?.includes,
  });

  const inheritsRow = features.inheritsFrom
    ? row(
        "inheritsFrom",
        `Includes all features of ${INHERITS_LABEL[getPlanTierSlug(features.inheritsFrom)]}`,
        "",
        { includes: true },
      )
    : null;

  switch (getPlanTierSlug(slug)) {
    case "free":
    case "starter":
      return [
        row("teams", "Teams", formatLimit(features.teams)),
        row("teamMembers", "Team members", formatLimit(features.teamMembers)),
        row("rbac", "RBAC", formatBoolean(features.rbac)),
        row("mcpAccess", "MCP server", formatMcpAccess(features.mcpAccess), {
          accent: features.mcpAccess === "read",
        }),
        row("support", "Support", formatSupport(features.support)),
      ];
    case "pro":
      return [
        row("teams", "Teams", formatLimit(features.teams)),
        row("teamMembers", "Team members", formatLimit(features.teamMembers)),
        row(
          "customDomain",
          "Custom domain / white labelling",
          formatBoolean(features.customDomain ?? false),
        ),
        row("mcpAccess", "MCP server", formatMcpAccess(features.mcpAccess)),
        ...(inheritsRow ? [inheritsRow] : []),
      ];
    case "max":
      return [
        row("teams", "Teams", formatLimit(features.teams)),
        row("teamMembers", "Team members", formatLimit(features.teamMembers)),
        row("support", "Support", formatSupport(features.support)),
        ...(inheritsRow ? [inheritsRow] : []),
      ];
    case "enterprise":
      return [
        row(
          "auditLogs",
          "Audit logs",
          formatBoolean(features.auditLogs ?? false),
        ),
        row("sso", "SSO", formatBoolean(features.sso ?? false)),
        row("ldap", "LDAP", formatBoolean(features.ldap ?? false)),
        row("support", "Support", formatSupport(features.support)),
        ...(inheritsRow ? [inheritsRow] : []),
      ];
    default:
      return [];
  }
}

export function isWithinPlanLimit(
  current: number,
  limit: PlanLimitValue,
): boolean {
  if (limit === "unlimited") {
    return true;
  }

  return current < limit;
}

export function hasMcpAccess(
  features: PlanFeatures,
  required: McpAccess,
): boolean {
  const order: McpAccess[] = ["none", "read", "full"];
  return order.indexOf(features.mcpAccess) >= order.indexOf(required);
}

export function planAllowsRbac(features: PlanFeatures): boolean {
  return features.rbac;
}
