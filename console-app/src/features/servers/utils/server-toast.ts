import { showErrorToast, showSuccessToast } from "@/lib/toast";

/** @deprecated Use showSuccessToast / showErrorToast from @/lib/toast */
export function showServerToast(
  variant: "success" | "error",
  message: string,
): void {
  if (variant === "success") {
    showSuccessToast(message);
    return;
  }

  showErrorToast(message);
}
