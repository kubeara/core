import { getErrorMessage } from "@/api/api-error";
import { BackLink } from "@/components/shared/back-link";
import { SkeletonGrid } from "@/components/shared/skeleton";
import {
  downloadInvoicePdf,
  useInvoicesQuery,
} from "@/features/invoices/hooks";
import type { Invoice } from "@/features/invoices/types";
import {
  formatPrice,
  formatUnixDate,
} from "@/features/subscriptions/hooks";
import "@/features/invoices/invoices-ui.css";

export function InvoicesPage() {
  const { data: invoices = [], isPending, isError, error } = useInvoicesQuery();

  return (
    <div className="profile-page">
      <BackLink to="/plans" label="Back" />

      <header className="dashboard-header">
        <div>
          <h1>Invoices</h1>
          <p>Download invoices for your subscription billing periods.</p>
        </div>
      </header>

      {isPending && <SkeletonGrid count={3} label="Loading invoices…" />}

      {isError && (
        <div className="profile-section-card">
          <p className="form-field-error">{getErrorMessage(error)}</p>
        </div>
      )}

      {!isPending && !isError && (
        <div className="profile-page-body invoices-page-body">
          <section className="profile-section-card">
            {invoices.length === 0 ? (
              <p className="invoices-empty">No invoices yet.</p>
            ) : (
              <div className="invoices-table-wrap">
                <table className="invoices-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Period</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th className="invoices-actions-header">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <InvoiceRow key={invoice.id} invoice={invoice} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 10l5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 21h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <tr>
      <td>{invoice.invoiceNumber}</td>
      <td>{formatUnixDate(invoice.issuedAt)}</td>
      <td>
        {formatUnixDate(invoice.periodStart)} –{" "}
        {formatUnixDate(invoice.periodEnd)}
      </td>
      <td>{formatPrice(invoice.total)}</td>
      <td>
        <span
          className={`invoices-status invoices-status--${invoice.status}`}
        >
          {invoice.status}
        </span>
      </td>
      <td className="invoices-actions">
        <button
          type="button"
          className="btn-secondary invoices-download-btn"
          onClick={() => downloadInvoicePdf(invoice)}
        >
          <DownloadIcon />
          Download
        </button>
      </td>
    </tr>
  );
}
