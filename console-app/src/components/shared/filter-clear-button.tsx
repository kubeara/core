type FilterClearButtonProps = {
  onClick: () => void;
  ariaLabel?: string;
};

export function FilterClearButton({
  onClick,
  ariaLabel = "Clear filters",
}: FilterClearButtonProps) {
  return (
    <button
      type="button"
      className="filter-clear-btn"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M18 6 6 18M6 6l12 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
