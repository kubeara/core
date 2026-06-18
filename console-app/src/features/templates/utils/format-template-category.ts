/**
 * Formats template category values for display.
 * API returns string[]; legacy/mock data may use a single string.
 */
export function formatTemplateCategory(
    category: string[] | string | null | undefined,
): string | null {
    if (category == null) {
        return null;
    }

    const values = Array.isArray(category)
        ? category
        : category
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);

    if (values.length === 0) {
        return null;
    }

    return values.join(" · ");
}
