import { createContext, useContext } from "react";

export type Theme = "light" | "dark";

export type ThemeContextValue = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
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