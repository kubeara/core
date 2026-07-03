import { createContext, useContext } from "react";

export type ThemePreference = "light" | "dark" | "system";

export type ResolvedTheme = "light" | "dark";

export type ThemeContextValue = {
    themePreference: ThemePreference;
    resolvedTheme: ResolvedTheme;
    setThemePreference: (preference: ThemePreference) => void;
    toggleTheme: () => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
    const ctx = useContext(ThemeContext);

    if (!ctx) {
        throw new Error("useTheme must be used within ThemeProvider");
    }

    return ctx;
}

export function getSystemTheme(): ResolvedTheme {
    if (typeof window === "undefined") {
        return "light";
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
    if (preference === "system") {
        return getSystemTheme();
    }

    return preference;
}
