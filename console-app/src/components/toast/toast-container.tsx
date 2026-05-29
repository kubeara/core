import { useCallback, useEffect, useState } from "react";
import { subscribeToasts } from "./toast-store";
import { ToastIcon } from "./toast-icons";
import type { ToastItem, ToastVariant } from "./types";
import "./toast.css";

const TOAST_DURATION_MS = 5000;
const TOAST_EXIT_MS = 220;

function variantClassName(variant: ToastVariant, isLeaving: boolean): string {
  return `toast toast-${variant}${isLeaving ? " is-leaving" : ""}`;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(new Set());

  const dismissToast = useCallback((id: string) => {
    setLeavingIds((current) => new Set(current).add(id));

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      setLeavingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, TOAST_EXIT_MS);
  }, []);

  useEffect(() => {
    return subscribeToasts((toast) => {
      setToasts((current) => [...current, toast]);

      window.setTimeout(() => {
        dismissToast(toast.id);
      }, TOAST_DURATION_MS);
    });
  }, [dismissToast]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={variantClassName(toast.variant, leavingIds.has(toast.id))}
          role={toast.variant === "error" ? "alert" : "status"}
        >
          <ToastIcon variant={toast.variant} />
          <div className="toast-body">
            <p className="toast-message">{toast.message}</p>
          </div>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
