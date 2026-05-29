import type { Theme } from "./use-theme";
import { useTheme } from "./use-theme";

type ThemeToggleProps = {
    variant?: "button" | "profile";
};

function SunIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
            <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function ThemeIcon({ theme }: { theme: Theme }) {
    return theme === "light" ? <MoonIcon /> : <SunIcon />;
}

const PROFILE_OPTIONS: { value: Theme; label: string; icon: typeof SunIcon }[] = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
];

/**
 * Theme toggle button component.
 *
 * - `button`: compact icon toggle (auth pages)
 * - `profile`: appearance selector for the profile settings page
 */
export function ThemeToggle({ variant = "button" }: ThemeToggleProps) {
    const { theme, setTheme, toggleTheme } = useTheme();
    const nextTheme = theme === "light" ? "dark" : "light";
    const label = `Switch to ${nextTheme} mode`;

    if (variant === "profile") {
        return (
            <div className="theme-toggle-profile" role="radiogroup" aria-label="Color theme">
                {PROFILE_OPTIONS.map(({ value, label: optionLabel, icon: Icon }) => {
                    const isActive = theme === value;

                    return (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            className={`theme-toggle-profile-option${isActive ? " is-active" : ""} text-sm`}
                            onClick={() => setTheme(value)}
                        >
                            <span className="theme-toggle-profile-icon">
                                <Icon />
                            </span>
                            <span>{optionLabel}</span>
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label={label}
            title={label}
        >
            <ThemeIcon theme={theme} />
        </button>
    );
}
