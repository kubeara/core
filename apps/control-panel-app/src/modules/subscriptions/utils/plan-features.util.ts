import { PlanSlug } from "../enums/plan-slug.enum";
import {
  McpAccess,
  PlanFeatureDisplayRow,
  PlanFeatures,
  PlanLimitValue,
  SupportTier,
} from "../interfaces/plan-features.interface";

const INHERITS_LABEL: Record<PlanSlug, string> = {
  [PlanSlug.FREE]: "",
  [PlanSlug.STARTER]: "Starter",
  [PlanSlug.PRO]: "Pro",
  [PlanSlug.MAX]: "Max",
  [PlanSlug.ENTERPRISE]: "Enterprise",
};

export const DEFAULT_PLAN_FEATURES: Record<PlanSlug, PlanFeatures> = {
  [PlanSlug.FREE]: {
    serverLimit: 1,
    teams: 1,
    teamMembers: 1,
    rbac: false,
    mcpAccess: "none",
    support: "community",
  },
  [PlanSlug.STARTER]: {
    serverLimit: 5,
    teams: 2,
    teamMembers: 10,
    rbac: true,
    mcpAccess: "read",
    support: "email",
  },
  [PlanSlug.PRO]: {
    serverLimit: 25,
    teams: 5,
    teamMembers: 25,
    rbac: true,
    mcpAccess: "full",
    support: "email",
    customDomain: true,
    inheritsFrom: PlanSlug.STARTER,
  },
  [PlanSlug.MAX]: {
    serverLimit: "unlimited",
    teams: "unlimited",
    teamMembers: "unlimited",
    rbac: true,
    mcpAccess: "full",
    support: "priority",
    customDomain: true,
    inheritsFrom: PlanSlug.PRO,
  },
  [PlanSlug.ENTERPRISE]: {
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
    inheritsFrom: PlanSlug.MAX,
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
    const inheritsFrom = Object.values(PlanSlug).find(
      (slug) => INHERITS_LABEL[slug].toLowerCase() === name.toLowerCase(),
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
  slug?: PlanSlug,
): PlanFeatures {
  if (isPlanFeaturesObject(raw)) {
    return {
      ...(slug ? DEFAULT_PLAN_FEATURES[slug] : {}),
      ...raw,
    };
  }

  if (Array.isArray(raw) && raw.every((item) => typeof item === "string")) {
    const merged: PlanFeatures = {
      ...(slug
        ? DEFAULT_PLAN_FEATURES[slug]
        : DEFAULT_PLAN_FEATURES[PlanSlug.FREE]),
    };

    for (const line of raw) {
      const patch = parseLegacyFeatureString(line);
      if (patch) {
        Object.assign(merged, patch);
      }
    }

    return merged;
  }

  if (slug) {
    return DEFAULT_PLAN_FEATURES[slug];
  }

  return DEFAULT_PLAN_FEATURES[PlanSlug.FREE];
}

export function getPlanServerBadge(
  features: PlanFeatures,
  slug: PlanSlug,
): string {
  if (slug === PlanSlug.ENTERPRISE) {
    return "Unlimited · Compliance & SSO";
  }

  if (features.serverLimit === "unlimited") {
    return "Unlimited servers";
  }

  const count = features.serverLimit;
  return count === 1 ? "1 server" : `${count} servers`;
}

export function getPlanFeatureRows(
  slug: PlanSlug,
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
        `Includes all features of ${INHERITS_LABEL[features.inheritsFrom]}`,
        "",
        { includes: true },
      )
    : null;

  switch (slug) {
    case PlanSlug.FREE:
    case PlanSlug.STARTER:
      return [
        row("teams", "Teams", formatLimit(features.teams)),
        row("teamMembers", "Team members", formatLimit(features.teamMembers)),
        row("rbac", "RBAC", formatBoolean(features.rbac)),
        row("mcpAccess", "MCP server", formatMcpAccess(features.mcpAccess), {
          accent: features.mcpAccess === "read",
        }),
        row("support", "Support", formatSupport(features.support)),
      ];
    case PlanSlug.PRO:
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
    case PlanSlug.MAX:
      return [
        row("teams", "Teams", formatLimit(features.teams)),
        row("teamMembers", "Team members", formatLimit(features.teamMembers)),
        row("support", "Support", formatSupport(features.support)),
        ...(inheritsRow ? [inheritsRow] : []),
      ];
    case PlanSlug.ENTERPRISE:
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
