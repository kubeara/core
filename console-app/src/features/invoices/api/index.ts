import { apiClient } from "@/api/axios";
import type { SubscriptionsApiResponse } from "@/features/subscriptions/types";
import type { Invoice } from "../types";

export async function fetchInvoices(): Promise<Invoice[]> {
  const response = await apiClient.get<SubscriptionsApiResponse<Invoice[]>>(
    "/subscriptions/invoices",
  );
  return response.data.data ?? [];
}
