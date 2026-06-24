export function normalizeTemplateCategories(
  category: string[] | string | null | undefined,
): string[] {
  if (category == null) {
    return [];
  }

  const values = Array.isArray(category)
    ? category
    : category
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

  return values.filter(Boolean);
}

const CATEGORY_WORD_OVERRIDES: Record<string, string> = {
  ai: "AI",
  api: "API",
  apm: "APM",
  baas: "BaaS",
  ci: "CI",
  cms: "CMS",
  crm: "CRM",
  devops: "DevOps",
  iam: "IAM",
  ide: "IDE",
  iot: "IoT",
  llm: "LLM",
  nosql: "NoSQL",
  sql: "SQL",
};

function formatCategoryWord(word: string): string {
  const normalized = word.toLowerCase();
  const override = CATEGORY_WORD_OVERRIDES[normalized];
  if (override) {
    return override;
  }

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function formatCategoryLabel(value: string): string {
  return value
    .trim()
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(formatCategoryWord)
    .join(" ");
}

export type TemplateCategoryFilterOption = {
  value: string;
  label: string;
};

export function buildTemplateCategoryFilterOptions(
  categories: string[],
): TemplateCategoryFilterOption[] {
  return [
    { value: "", label: "All" },
    ...categories.map((entry) => ({
      value: entry,
      label: formatCategoryLabel(entry),
    })),
  ];
}

export type TemplateCategoryTagsDisplay = {
  visible: string[];
  overflowCount: number;
};

export function getTemplateCategoryTagsDisplay(
  category: string[] | string | null | undefined,
  maxVisible = 2,
): TemplateCategoryTagsDisplay | null {
  const labels = normalizeTemplateCategories(category).map(formatCategoryLabel);

  if (labels.length === 0) {
    return null;
  }

  const limit = Math.max(1, maxVisible);

  return {
    visible: labels.slice(0, limit),
    overflowCount: Math.max(0, labels.length - limit),
  };
}

/**
 * Formats template category values for display.
 * API returns string[]; legacy/mock data may use a single string.
 */
export function formatTemplateCategory(
  category: string[] | string | null | undefined,
): string | null {
  const values = normalizeTemplateCategories(category);

  if (values.length === 0) {
    return null;
  }

  return values.map(formatCategoryLabel).join(" · ");
}
