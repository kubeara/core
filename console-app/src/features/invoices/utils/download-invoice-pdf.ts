import { jsPDF } from "jspdf";
import type { Invoice } from "../types";

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function billingCycleLabel(cycle: Invoice["billingCycle"]): string {
  if (cycle === "quarterly") return "Quarterly";
  if (cycle === "yearly") return "Yearly";
  return "Monthly";
}

export function downloadInvoicePdf(invoice: Invoice): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("INVOICE", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(invoice.invoiceNumber, margin, y + 18);

  doc.setTextColor(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(invoice.issuer.name, pageWidth - margin, y, { align: "right" });

  y += 52;
  doc.setDrawColor(220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  const colWidth = contentWidth / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("BILL TO", margin, y);
  doc.text("INVOICE DETAILS", margin + colWidth, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(invoice.billTo.organization, margin, y);
  doc.text(`Date: ${formatDate(invoice.issuedAt)}`, margin + colWidth, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(invoice.billTo.name, margin, y);
  doc.text(
    `Period: ${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}`,
    margin + colWidth,
    y,
  );
  y += 14;
  doc.text(invoice.billTo.email, margin, y);
  doc.text(`Status: ${invoice.status.toUpperCase()}`, margin + colWidth, y);
  y += 28;

  const tableTop = y;
  const rowHeight = 28;
  const columns = [
    { label: "Description", x: margin, width: contentWidth * 0.46 },
    { label: "Qty", x: margin + contentWidth * 0.46, width: contentWidth * 0.1 },
    {
      label: "Unit price",
      x: margin + contentWidth * 0.56,
      width: contentWidth * 0.22,
    },
    {
      label: "Amount",
      x: margin + contentWidth * 0.78,
      width: contentWidth * 0.22,
    },
  ];

  doc.setFillColor(245, 245, 245);
  doc.rect(margin, tableTop, contentWidth, rowHeight, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80);
  for (const column of columns) {
    doc.text(column.label, column.x + 8, tableTop + 18);
  }

  y = tableTop + rowHeight;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30);

  for (const item of invoice.lineItems) {
    doc.text(item.description, columns[0].x + 8, y + 18, {
      maxWidth: columns[0].width - 16,
    });
    doc.text(String(item.quantity), columns[1].x + 8, y + 18);
    doc.text(
      formatMoney(item.unitAmount, invoice.currency),
      columns[2].x + 8,
      y + 18,
    );
    doc.text(
      formatMoney(item.amount, invoice.currency),
      columns[3].x + columns[3].width - 8,
      y + 18,
      { align: "right" },
    );
    doc.setDrawColor(235);
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    y += rowHeight;
  }

  const totalsX = margin + contentWidth * 0.56;
  const totalsValueX = pageWidth - margin;
  y += 12;

  doc.setFontSize(10);
  doc.text("Subtotal", totalsX, y);
  doc.text(formatMoney(invoice.subtotal, invoice.currency), totalsValueX, y, {
    align: "right",
  });
  y += 16;

  if (invoice.discount > 0) {
    const discountLabel = invoice.promoCode
      ? `Discount (${invoice.promoCode})`
      : "Discount";
    doc.setTextColor(22, 120, 70);
    doc.text(discountLabel, totalsX, y);
    doc.text(
      `-${formatMoney(invoice.discount, invoice.currency)}`,
      totalsValueX,
      y,
      { align: "right" },
    );
    doc.setTextColor(30);
    y += 16;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total", totalsX, y);
  doc.text(formatMoney(invoice.total, invoice.currency), totalsValueX, y, {
    align: "right",
  });
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${invoice.planName} · ${billingCycleLabel(invoice.billingCycle)} billing`,
    margin,
    y,
  );
  doc.text("Thank you for your business.", margin, y + 14);

  doc.save(`${invoice.invoiceNumber}.pdf`);
}
