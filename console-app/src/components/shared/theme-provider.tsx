import {
    useCallback,
    useEffect,
    useState,
} from "react";

import {
    Theme,
    ThemeContext,
} from "./use-theme";

/**
 * Get the initial theme from localStorage or system preference.
 *
 * Priority:
 * 1. Stored theme in localStorage
 * 2. Default to dark
 *
 * @returns The initial theme
 */
function getInitialTheme(): Theme {
    if (typeof window === "undefined") return "dark";

    const stored = localStorage.getItem("kubeara-theme") as Theme | null;

    if (stored === "light" || stored === "dark") {
        return stored;
    }

    return "dark";
}

/**
 * Theme provider component.
 *
 * Provides theme state and controls to the application.
 * Persists theme preference to localStorage.
 * Applies theme to document root via data-theme attribute.
 *
 * @param children - Child components
 */
export function ThemeProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [theme, setThemeState] = useState<Theme>(getInitialTheme);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

    const setTheme = useCallback((next: Theme) => {
        setThemeState(next);
        localStorage.setItem("kubeara-theme", next);
        document.documentElement.setAttribute("data-theme", next);
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme(theme === "light" ? "dark" : "light");
    }, [theme, setTheme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}