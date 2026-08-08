import { PlanTierSlug } from "../enums/plan-slug.enum";
import { getPlanTierSlug } from "./plan-slug.util";
import {
  McpAccess,
  PlanFeatureDisplayRow,
  PlanFeatures,
  PlanLimitValue,
  SupportTier,
} from "../interfaces/plan-features.interface";

/**
 * Maps each plan tier slug to the English display name used in legacy feature
 * strings stored in the database (e.g. "Includes all features of Starter").
 * This is used only when parsing those stored English strings back into
 * structured PlanFeatures — it is not used for any user-facing display.
 */
const LEGACY_INHERITS_LABEL: Record<PlanTierSlug, string> = {
  free: "",
  starter: "Starter",
  pro: "Pro",
  max: "Max",
  enterprise: "Enterprise",
};

export type PlanFeatureLabels = Record<string, string>;

const PLAN_NAME_KEY: Record<PlanTierSlug, string> = {
  free: "exploringKubeara",
  starter: "smallProductionTeams",
  pro: "growingCollaborativeTeams",
  max: "teamsOperatingAtScale",
  enterprise: "complianceFocusedOrganizations",
};

/** Returns the locale catalog key for a plan tier's name and description. */
export function getPlanTranslationKey(slug: string): string {
  return PLAN_NAME_KEY[getPlanTierSlug(slug)];
}

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

function interpolate(
  value: string,
  params: Record<string, string | number>,
): string {
  return Object.entries(params).reduce(
    (result, [key, replacement]) =>
      result.replace("{{" + key + "}}", String(replacement)),
    value,
  );
}

/**
 * Returns the localized display string for a numeric or unlimited limit value.
 * @param value - The raw limit, either a number or the sentinel "unlimited".
 * @param text - The resolved display-text map for the current locale.
 */
function formatLimit(value: PlanLimitValue, text: PlanFeatureLabels): string {
  return value === "unlimited" ? text.noLimits : String(value);
}

/**
 * Returns the localized display string for a boolean feature flag.
 * @param value - The raw boolean value.
 * @param text - The resolved display-text map for the current locale.
 */
function formatBoolean(value: boolean, text: PlanFeatureLabels): string {
  return value ? text.available : text.notAvailable;
}

/**
 * Returns the localized display string for an MCP access level.
 * @param value - The raw MCP access level ("none" | "read" | "full").
 * @param text - The resolved display-text map for the current locale.
 */
function formatMcpAccess(value: McpAccess, text: PlanFeatureLabels): string {
  return value === "none"
    ? text.noAccess
    : value === "read"
      ? text.readAndWriteAccess
      : text.fullAccess;
}

/**
 * Returns the localized display string for a support tier.
 * @param value - The raw support tier ("community" | "email" | "priority" | "dedicated").
 * @param text - The resolved display-text map for the current locale.
 */
function formatSupport(value: SupportTier, text: PlanFeatureLabels): string {
  return text[
    {
      community: "communityHelp",
      email: "emailHelp",
      priority: "priorityHelp",
      dedicated: "dedicatedHelp",
    }[value]
  ];
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
    const inheritsFrom = (
      Object.keys(LEGACY_INHERITS_LABEL) as PlanTierSlug[]
    ).find(
      (tier) =>
        LEGACY_INHERITS_LABEL[tier].toLowerCase() === name.toLowerCase(),
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

/**
 * Returns the localized server badge string for a plan (e.g. "1 server",
 * "5 servers", "Unlimited servers", or "Unlimited" for enterprise).
 * @param features - The resolved plan features.
 * @param slug - The plan slug used to determine the tier.
 * @param text - The resolved display-text map for the current locale.
 */
export function getPlanServerBadge(
  features: PlanFeatures,
  slug: string,
  text: PlanFeatureLabels,
): string {
  const tier = getPlanTierSlug(slug);
  if (tier === "enterprise") {
    return text.noLimits;
  }

  if (features.serverLimit === "unlimited") {
    return text.unlimitedServers;
  }

  const count = features.serverLimit;
  return count === 1
    ? text.oneServer
    : interpolate(text.multipleServers, { count });
}

/**
 * Builds the localized feature display rows for a plan tier.
 * Each row contains a stable key, a translated label, and a translated value.
 * @param slug - The plan slug used to determine which rows to include.
 * @param features - The resolved plan features.
 * @param text - The resolved display-text map for the current locale.
 * @param inheritedPlanName - Optional localized name of the inherited plan,
 *   used to populate the "Includes all features of …" row.
 */
export function getPlanFeatureRows(
  slug: string,
  features: PlanFeatures,
  text: PlanFeatureLabels,
  inheritedPlanName?: string,
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
        interpolate(text.featuresIncludedFromAnotherPlan, {
          planName: inheritedPlanName ?? getPlanTierSlug(features.inheritsFrom),
        }),
        "",
        { includes: true },
      )
    : null;

  switch (getPlanTierSlug(slug)) {
    case "free":
    case "starter":
      return [
        row("teams", text.teamsYouCanCreate, formatLimit(features.teams, text)),
        row(
          "teamMembers",
          text.peoplePerTeam,
          formatLimit(features.teamMembers, text),
        ),
        row(
          "rbac",
          text.roleBasedPermissions,
          formatBoolean(features.rbac, text),
        ),
        row(
          "mcpAccess",
          text.mcpServerAccess,
          formatMcpAccess(features.mcpAccess, text),
        ),
        row(
          "support",
          text.helpAndSupport,
          formatSupport(features.support, text),
        ),
      ];
    case "pro":
      return [
        row("teams", text.teamsYouCanCreate, formatLimit(features.teams, text)),
        row(
          "teamMembers",
          text.peoplePerTeam,
          formatLimit(features.teamMembers, text),
        ),
        row(
          "customDomain",
          text.brandedCustomDomain,
          formatBoolean(features.customDomain ?? false, text),
        ),
        row(
          "mcpAccess",
          text.mcpServerAccess,
          formatMcpAccess(features.mcpAccess, text),
        ),
        ...(inheritsRow ? [inheritsRow] : []),
      ];
    case "max":
      return [
        row("teams", text.teamsYouCanCreate, formatLimit(features.teams, text)),
        row(
          "teamMembers",
          text.peoplePerTeam,
          formatLimit(features.teamMembers, text),
        ),
        row(
          "support",
          text.helpAndSupport,
          formatSupport(features.support, text),
        ),
        ...(inheritsRow ? [inheritsRow] : []),
      ];
    case "enterprise":
      return [
        row(
          "auditLogs",
          text.activityHistory,
          formatBoolean(features.auditLogs ?? false, text),
        ),
        row(
          "sso",
          text.singleSignOn,
          formatBoolean(features.sso ?? false, text),
        ),
        row(
          "ldap",
          text.directoryServiceIntegration,
          formatBoolean(features.ldap ?? false, text),
        ),
        row(
          "support",
          text.helpAndSupport,
          formatSupport(features.support, text),
        ),
        ...(inheritsRow ? [inheritsRow] : []),
      ];
    default:
      return [];
  }
}

/**
 * Builds a human-readable feature map for a plan in the requested locale.
 * Keys are the localized display labels (e.g. "Teams", "Équipes", "MCP server").
 * Values are the raw structural values from PlanFeatures — numbers, booleans,
 * strings, or "unlimited" — not translated display strings.
 * This is the shape stored in planTranslations.features.
 *
 * Example output (en):
 * {
 *   "Teams": 5,
 *   "Team members": 25,
 *   "RBAC": true,
 *   "MCP server": "full",
 *   "Support": "email",
 *   "Custom domain / white labelling": true,
 *   "Includes all features of": "starter"
 * }
 *
 * @param features - The resolved plan features.
 * @param text - The localized display-text map for the current locale.
 */
export function buildPlanFeatureMap(
  features: PlanFeatures,
  text: PlanFeatureLabels,
): Record<string, string | number | boolean> {
  const map: Record<string, string | number | boolean> = {
    [text.teamsYouCanCreate]: features.teams,
    [text.peoplePerTeam]: features.teamMembers,
    [text.roleBasedPermissions]: features.rbac,
    [text.mcpServerAccess]: features.mcpAccess,
    [text.helpAndSupport]: features.support,
  };

  if (features.serverLimit !== undefined) {
    map[text.serverLimit] = features.serverLimit;
  }

  if (features.customDomain !== undefined) {
    map[text.brandedCustomDomain] = features.customDomain;
  }

  if (features.auditLogs !== undefined) {
    map[text.activityHistory] = features.auditLogs;
  }

  if (features.sso !== undefined) {
    map[text.singleSignOn] = features.sso;
  }

  if (features.ldap !== undefined) {
    map[text.directoryServiceIntegration] = features.ldap;
  }

  if (features.inheritsFrom !== undefined) {
    map[text.inheritsFrom] = features.inheritsFrom;
  }

  return map;
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
