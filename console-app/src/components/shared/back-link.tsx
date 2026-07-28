import { Link } from "react-router";
import { cn } from "@/lib/utils";
import "./back-link.css";

type BackLinkProps = {
  to: string;
  label: string;
  showLabel?: boolean;
  className?: string;
};

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="back-link-icon"
    >
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BackLink({
  to,
  label,
  showLabel = true,
  className,
}: BackLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        "back-link",
        !showLabel && "back-link--icon-only",
        className,
      )}
      aria-label={showLabel ? undefined : label}
    >
      <BackIcon />
      {showLabel ? <span className="back-link-label">{label}</span> : null}
    </Link>
  );
}
