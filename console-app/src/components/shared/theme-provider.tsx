import {
    useCallback,
    useEffect,
    useState,
} from "react";

import {
    getSystemTheme,
    resolveTheme,
    ThemeContext,
    ThemePreference,
    ResolvedTheme,
} from "./use-theme";

const THEME_STORAGE_KEY = "kubeara-theme";

function getInitialPreference(): ThemePreference {
    if (typeof window === "undefined") {
        return "system";
    }

    const stored = localStorage.getItem(THEME_STORAGE_KEY);

    if (stored === "light" || stored === "dark" || stored === "system") {
        return stored;
    }

    return "system";
}

function applyResolvedTheme(theme: ResolvedTheme): void {
    document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Theme provider component.
 *
 * Provides theme state and controls to the application.
 * Persists theme preference to localStorage.
 * Applies resolved theme to document root via data-theme attribute.
 *
 * @param children - Child components
 */
export function ThemeProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [themePreference, setThemePreferenceState] =
        useState<ThemePreference>(getInitialPreference);
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
        resolveTheme(getInitialPreference()),
    );

    useEffect(() => {
        applyResolvedTheme(resolvedTheme);
    }, [resolvedTheme]);

    useEffect(() => {
        if (themePreference !== "system") {
            setResolvedTheme(themePreference);
            return;
        }

        setResolvedTheme(getSystemTheme());

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            setResolvedTheme(getSystemTheme());
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, [themePreference]);

    const setThemePreference = useCallback((next: ThemePreference) => {
        setThemePreferenceState(next);
        localStorage.setItem(THEME_STORAGE_KEY, next);
        setResolvedTheme(resolveTheme(next));
    }, []);

    const toggleTheme = useCallback(() => {
        const nextPreference: ThemePreference =
            resolvedTheme === "light" ? "dark" : "light";
        setThemePreference(nextPreference);
    }, [resolvedTheme, setThemePreference]);

    return (
        <ThemeContext.Provider
            value={{
                themePreference,
                resolvedTheme,
                setThemePreference,
                toggleTheme,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}
