import type { ToastVariant } from "./types";

type ToastIconProps = {
  variant: ToastVariant;
};

export function ToastIcon({ variant }: ToastIconProps) {
  switch (variant) {
    case "success":
      return (
        <svg className="toast-icon" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M6.5 10.2 8.8 12.5 13.5 7.8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "error":
      return (
        <svg className="toast-icon" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 6.2v4.3M10 13.4h.01"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "warning":
      return (
        <svg className="toast-icon" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M10 3.2 16.8 15.8H3.2L10 3.2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M10 8.2v3.2M10 13.6h.01"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "info":
    default:
      return (
        <svg className="toast-icon" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 8.8v5.2M10 6.2h.01"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
