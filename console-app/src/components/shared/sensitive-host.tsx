import { useState } from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import "./sensitive-host.css";

function maskHost(host: string): string {
  return "*".repeat(host.length);
}

type SensitiveHostProps = {
  host: string;
  className?: string;
  valueClassName?: string;
  monospace?: boolean;
};

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-6.09"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M1 1l22 22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9.88 9.88a3 3 0 1 0 4.24 4.24"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SensitiveHost({
  host,
  className,
  valueClassName,
  monospace = true,
}: SensitiveHostProps) {
  const [visible, setVisible] = useState(false);
  const trimmed = host.trim();

  if (!trimmed) {
    return null;
  }

  const display = visible ? trimmed : maskHost(trimmed);

  return (
    <span className={cn("sensitive-host", className)}>
      <span
        className={cn(
          "sensitive-host-value",
          monospace && "sensitive-host-value--mono",
          valueClassName,
        )}
      >
        {monospace ? <code>{display}</code> : display}
      </span>
      <span className="sensitive-host-actions">
        <button
          type="button"
          className="sensitive-host-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide IP address" : "Show IP address"}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        {visible ? <CopyButton text={trimmed} label="Copy host" /> : null}
      </span>
    </span>
  );
}
