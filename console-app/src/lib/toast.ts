import { publishToast } from "@/components/toast/toast-store";
import type { ToastInput, ToastVariant } from "@/components/toast/types";

export type { ToastVariant, ToastInput };

export function showToast(variant: ToastVariant, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) {
    return;
  }

  publishToast({ variant, message: trimmed });
}

export function showSuccessToast(message: string): void {
  showToast("success", message);
}

export function showErrorToast(message: string): void {
  showToast("error", message);
}

export function showWarningToast(message: string): void {
  showToast("warning", message);
}

export function showInfoToast(message: string): void {
  showToast("info", message);
}
