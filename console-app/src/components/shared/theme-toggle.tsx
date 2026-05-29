import { useTheme } from "./use-theme";

type ThemeToggleProps = {
  compact?: boolean;
  variant?: "button" | "switch";
};

function SunIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
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

function MoonIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
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

/**
 * Theme toggle button component.
 *
 * Displays a sun icon in light mode and moon icon in dark mode.
 * Toggles between light and dark themes when clicked.
 */
export function ThemeToggle({ compact = false, variant = "button" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "light" ? "dark" : "light";
  const iconSize = compact ? 16 : 18;
  const isDark = theme === "dark";

  if (variant === "switch") {
    const switchIconSize = 16;

    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        onClick={toggleTheme}
        className={`theme-switch-control${isDark ? " is-on" : ""}`}
        aria-label={`Switch to ${nextTheme} mode`}
        title={`Switch to ${nextTheme} mode`}
      >
        <span className="theme-switch-icon theme-switch-icon--sun">
          <SunIcon size={switchIconSize} />
        </span>
        <span className="theme-switch-icon theme-switch-icon--moon">
          <MoonIcon size={switchIconSize} />
        </span>
        <span className="theme-switch-thumb" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle${compact ? " theme-toggle--compact" : ""}`}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === "light" ? (
        <MoonIcon size={iconSize} />
      ) : (
        <SunIcon size={iconSize} />
      )}
    </button>
  );
}
