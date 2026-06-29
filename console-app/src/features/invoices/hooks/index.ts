import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/query-keys";
import { fetchInvoices } from "../api";

export function useInvoicesQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.subscriptions.invoices,
    queryFn: fetchInvoices,
  });
}

export { downloadInvoicePdf } from "../utils/download-invoice-pdf";
