import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import "./dropdown.css";

export type DropdownOption<T extends string = string> = {
  value: T;
  label: string;
};

type DropdownProps<T extends string = string> = {
  id?: string;
  label?: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  /** When set, this option value always stays visible while filtering. */
  pinnedOptionValue?: T;
  /** Formats the display label for an option value (trigger, menu, search). */
  formatLabel?: (value: T) => string;
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`dropdown-chevron${open ? " is-open" : ""}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Dropdown<T extends string = string>({
  id: idProp,
  label,
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  className,
  searchable = false,
  searchPlaceholder = "Search…",
  noResultsLabel = "No results found",
  pinnedOptionValue,
  formatLabel,
}: DropdownProps<T>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listboxId = `${id}-listbox`;
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const comboboxInputRef = useRef<HTMLInputElement>(null);

  const resolveOptionLabel = useCallback(
    (option: DropdownOption<T>) =>
      formatLabel ? formatLabel(option.value) : option.label,
    [formatLabel],
  );

  const selected =
    options.find((option) => option.value === value) ?? options[0];
  const selectedLabel = resolveOptionLabel(selected);

  const visibleOptions = useMemo(() => {
    if (!searchable) {
      return options;
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return options;
    }

    return options.filter((option) => {
      if (
        pinnedOptionValue !== undefined &&
        option.value === pinnedOptionValue
      ) {
        return true;
      }

      const displayLabel = resolveOptionLabel(option).toLowerCase();
      return (
        displayLabel.includes(query) ||
        option.value.toLowerCase().includes(query) ||
        option.label.toLowerCase().includes(query)
      );
    });
  }, [options, pinnedOptionValue, resolveOptionLabel, searchQuery, searchable]);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        comboboxInputRef.current?.blur();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function openCombobox() {
    if (disabled || open) return;

    setOpen(true);
    setSearchQuery("");
    requestAnimationFrame(() => {
      const input = comboboxInputRef.current;
      input?.focus();
      input?.select();
    });
  }

  function toggleCombobox() {
    if (disabled) return;

    if (open) {
      setOpen(false);
      comboboxInputRef.current?.blur();
      return;
    }

    openCombobox();
  }

  function selectOption(next: T) {
    onChange(next);
    setOpen(false);
    setSearchQuery("");
  }

  function renderOptions(optionList: DropdownOption<T>[]) {
    if (optionList.length === 0) {
      return (
        <li className="dropdown-empty" role="presentation">
          {noResultsLabel}
        </li>
      );
    }

    return optionList.map((option) => (
      <li key={option.value} role="presentation">
        <button
          type="button"
          role="option"
          aria-selected={option.value === value}
          className={`dropdown-option${option.value === value ? " is-selected" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectOption(option.value)}
        >
          {resolveOptionLabel(option)}
        </button>
      </li>
    ));
  }

  return (
    <div
      ref={rootRef}
      className={`dropdown${className ? ` ${className}` : ""}${disabled ? " is-disabled" : ""}${open ? " is-open" : ""}${searchable ? " is-searchable" : ""}`}
    >
      {label && (
        <label id={`${id}-label`} htmlFor={id}>
          {label}
        </label>
      )}

      {searchable ? (
        <>
          <div
            className={`dropdown-trigger dropdown-trigger--combobox${open ? " is-open" : ""}`}
            onClick={(event) => {
              if (disabled || open) return;

              const target = event.target as HTMLElement;
              if (target.closest(".dropdown-combobox-toggle")) return;

              openCombobox();
            }}
          >
            <input
              ref={comboboxInputRef}
              id={id}
              type="text"
              role="combobox"
              className="dropdown-combobox-input"
              value={open ? searchQuery : selectedLabel}
              readOnly={!open}
              placeholder={open ? searchPlaceholder : undefined}
              aria-label={ariaLabel ?? label ?? searchPlaceholder}
              aria-labelledby={label ? `${id}-label` : undefined}
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              onFocus={openCombobox}
              onClick={() => {
                if (!disabled && !open) {
                  openCombobox();
                }
              }}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                if (!open) {
                  setOpen(true);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && !open) {
                  event.preventDefault();
                  openCombobox();
                }
              }}
            />
            <button
              type="button"
              className="dropdown-combobox-toggle"
              aria-label={open ? "Close category list" : "Open category list"}
              disabled={disabled}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={toggleCombobox}
            >
              <ChevronIcon open={open} />
            </button>
          </div>
          {open && (
            <ul
              id={listboxId}
              className="dropdown-menu"
              role="listbox"
              aria-labelledby={label ? `${id}-label` : undefined}
            >
              {renderOptions(visibleOptions)}
            </ul>
          )}
        </>
      ) : (
        <>
          <button
            id={id}
            type="button"
            className="dropdown-trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-labelledby={label ? `${id}-label` : undefined}
            aria-label={ariaLabel ?? label}
            disabled={disabled}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className="dropdown-trigger-label">{selectedLabel}</span>
            <ChevronIcon open={open} />
          </button>
          {open && (
            <ul
              id={listboxId}
              className="dropdown-menu"
              role="listbox"
              aria-labelledby={label ? `${id}-label` : undefined}
            >
              {renderOptions(options)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
