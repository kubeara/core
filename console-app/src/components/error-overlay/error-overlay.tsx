import { useEffect, useRef, useState } from "react";
import {
  dismissAllAppErrors,
  dismissAppError,
  subscribeAppErrors,
} from "./error-overlay-store";
import type { AppErrorItem } from "./types";
import "./error-overlay.css";

function ErrorIcon() {
  return (
    <svg
      className="error-overlay-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6.2v4.3M10 13.4h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
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

function errorCountLabel(count: number): string {
  return count === 1 ? "1 error" : `${count} errors`;
}

/**
 * Bottom-right error panel for failed operations.
 *
 * Renders nothing when there are no errors. New errors open the panel, which
 * the user can collapse to a badge or dismiss entirely.
 */
export function ErrorOverlay() {
  const [errors, setErrors] = useState<AppErrorItem[]>([]);
  const [expanded, setExpanded] = useState(true);
  const errorCount = useRef(0);

  useEffect(() => {
    return subscribeAppErrors((next) => {
      setErrors(next);

      if (next.length > errorCount.current) {
        setExpanded(true);
      }
      errorCount.current = next.length;
    });
  }, []);

  if (errors.length === 0) {
    return null;
  }

  if (!expanded) {
    return (
      <div className="error-overlay">
        <button
          type="button"
          className="error-overlay-badge"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
        >
          <ErrorIcon />
          {errorCountLabel(errors.length)}
        </button>
      </div>
    );
  }

  return (
    <div className="error-overlay">
      <section className="error-overlay-panel" role="alert">
        <header className="error-overlay-header">
          <ErrorIcon />
          <h2 className="error-overlay-title">
            {errorCountLabel(errors.length)}
          </h2>
          <button
            type="button"
            className="error-overlay-action"
            onClick={() => setExpanded(false)}
            aria-expanded
            aria-label="Collapse errors"
          >
            <CollapseIcon />
          </button>
          <button
            type="button"
            className="error-overlay-action"
            onClick={dismissAllAppErrors}
            aria-label="Dismiss all errors"
          >
            ×
          </button>
        </header>

        <div className="error-overlay-body">
          {errors.map((error) => (
            <div key={error.id} className="error-overlay-item">
              <p className="error-overlay-message">{error.message}</p>
              <button
                type="button"
                className="error-overlay-action"
                onClick={() => dismissAppError(error.id)}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
