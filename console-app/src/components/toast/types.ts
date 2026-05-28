export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastItem = {
  id: string;
  variant: ToastVariant;
  message: string;
};

export type ToastInput = Omit<ToastItem, "id">;
