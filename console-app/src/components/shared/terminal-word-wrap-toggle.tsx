function IconWordWrap() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M4 12h10M4 18h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M18 10v4M16 12h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconWordWrapOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

type TerminalWordWrapToggleProps = {
  wordWrap: boolean;
  onToggle: () => void;
  className?: string;
};

export function TerminalWordWrapToggle({
  wordWrap,
  onToggle,
  className = "server-terminal-icon-btn",
}: TerminalWordWrapToggleProps) {
  return (
    <button
      type="button"
      className={`${className}${wordWrap ? " is-active" : ""}`}
      onClick={onToggle}
      aria-label={wordWrap ? "Disable word wrap" : "Enable word wrap"}
      aria-pressed={wordWrap}
      title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
    >
      {wordWrap ? <IconWordWrap /> : <IconWordWrapOff />}
    </button>
  );
}
