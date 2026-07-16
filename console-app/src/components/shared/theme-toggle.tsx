import { ThemePreference, useTheme } from "./use-theme";
import { TooltipHint } from "@/components/ui/tooltip";

type ThemeToggleProps = {
  compact?: boolean;
  variant?: "button" | "switch";
};

const THEME_PREFERENCE_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
}> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

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

function SystemIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 20h8M12 16v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Theme preference selector for profile/settings pages.
 */
export function ThemePreferenceSelector({
  compact = false,
  firstOptionId = "profile-theme-light",
  labelledBy,
}: {
  compact?: boolean;
  firstOptionId?: string;
  labelledBy?: string;
}) {
  const { themePreference, setThemePreference } = useTheme();
  const iconSize = compact ? 14 : 18;

  return (
    <div
      className={`theme-preference-selector${compact ? " theme-preference-selector--compact" : ""}`}
      role="radiogroup"
      aria-label={labelledBy ? undefined : "Appearance"}
      aria-labelledby={labelledBy}
    >
      {THEME_PREFERENCE_OPTIONS.map((option) => {
        const isSelected = themePreference === option.value;

        return (
          <button
            key={option.value}
            id={option.value === "light" ? firstOptionId : undefined}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`theme-preference-option${isSelected ? " is-selected" : ""}`}
            onClick={() => setThemePreference(option.value)}
          >
            <span className="theme-preference-option-icon" aria-hidden>
              {option.value === "light" ? (
                <SunIcon size={iconSize} />
              ) : option.value === "dark" ? (
                <MoonIcon size={iconSize} />
              ) : (
                <SystemIcon size={iconSize} />
              )}
            </span>
            <span className="theme-preference-option-label">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Theme toggle button component.
 *
 * Displays a sun icon in light mode and moon icon in dark mode.
 * Toggles between light and dark themes when clicked.
 */
export function ThemeToggle({
  compact = false,
  variant = "button",
}: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const nextTheme = resolvedTheme === "light" ? "dark" : "light";
  const iconSize = compact ? 16 : 18;
  const isDark = resolvedTheme === "dark";

  if (variant === "switch") {
    const switchIconSize = 16;

    return (
      <TooltipHint content={`Switch to ${nextTheme} mode`}>
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          onClick={toggleTheme}
          className={`theme-switch-control${isDark ? " is-on" : ""}`}
          aria-label={`Switch to ${nextTheme} mode`}
        >
          <span className="theme-switch-icon theme-switch-icon--sun">
            <SunIcon size={switchIconSize} />
          </span>
          <span className="theme-switch-icon theme-switch-icon--moon">
            <MoonIcon size={switchIconSize} />
          </span>
          <span className="theme-switch-thumb" aria-hidden />
        </button>
      </TooltipHint>
    );
  }

  return (
    <TooltipHint content={`Switch to ${nextTheme} mode`}>
      <button
        type="button"
        onClick={toggleTheme}
        className={`theme-toggle${compact ? " theme-toggle--compact" : ""}`}
        aria-label={`Switch to ${nextTheme} mode`}
      >
        {resolvedTheme === "light" ? (
          <MoonIcon size={iconSize} />
        ) : (
          <SunIcon size={iconSize} />
        )}
      </button>
    </TooltipHint>
  );
}
