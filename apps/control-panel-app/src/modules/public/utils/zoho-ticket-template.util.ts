import * as fs from "fs";
import * as path from "path";

import { SubmitServiceRequestDto } from "../dto/submit-service-request.dto";
import { SubmitSupportRequestDto } from "../dto/submit-support-request.dto";

const TEMPLATE_FILE = "zoho-ticket-description.html";
const LOGO_FILE = "kubeara-logo.webp";

let cachedTemplate: string | null = null;
let cachedLogoDataUri: string | null = null;

interface ZohoTicketDetailRow {
  label: string;
  value: string;
  isEmail?: boolean;
}

interface ZohoTicketTemplateInput {
  brandName: string;
  headerSubtitle: string;
  details: ZohoTicketDetailRow[];
  contentLabel: string;
  content: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => values[key] ?? "",
  );
}

function loadTemplate(): string {
  if (cachedTemplate) {
    return cachedTemplate;
  }

  cachedTemplate = fs.readFileSync(
    path.join(__dirname, "../templates", TEMPLATE_FILE),
    "utf-8",
  );

  return cachedTemplate;
}

function getLogoDataUri(): string {
  if (cachedLogoDataUri) {
    return cachedLogoDataUri;
  }

  const logoBuffer = fs.readFileSync(
    path.join(__dirname, "../assets", LOGO_FILE),
  );
  cachedLogoDataUri = `data:image/webp;base64,${logoBuffer.toString("base64")}`;

  return cachedLogoDataUri;
}

function formatSubmittedAt(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function buildDetailsRows(details: ZohoTicketDetailRow[]): string {
  return details
    .map((detail, index) => {
      const isLast = index === details.length - 1;
      const borderStyle = isLast ? "" : "border-bottom:1px solid #e5e7eb;";
      const valueCell = detail.isEmail
        ? `<a href="mailto:${detail.value}" style="color:#2563eb;text-decoration:none;">${detail.value}</a>`
        : detail.value;

      return [
        "<tr>",
        `<td style="width:140px;padding:12px 16px;background-color:#f9fafb;${borderStyle}font-size:13px;font-weight:600;color:#374151;">${detail.label}</td>`,
        `<td style="padding:12px 16px;${borderStyle}font-size:14px;color:#111827;">${valueCell}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");
}

function buildZohoTicketDescription(input: ZohoTicketTemplateInput): string {
  return renderTemplate(loadTemplate(), {
    brandName: escapeHtml(input.brandName),
    logoDataUri: getLogoDataUri(),
    headerSubtitle: escapeHtml(input.headerSubtitle),
    detailsRows: buildDetailsRows(input.details),
    contentLabel: escapeHtml(input.contentLabel),
    content: escapeHtml(input.content),
    submittedAt: formatSubmittedAt(new Date()),
  });
}

export function buildSupportTicketDescription(
  input: SubmitSupportRequestDto,
  brandName: string,
): string {
  return buildZohoTicketDescription({
    brandName,
    headerSubtitle: "Support request",
    details: [
      { label: "Name", value: escapeHtml(input.name.trim()) },
      {
        label: "Email",
        value: escapeHtml(input.email.trim()),
        isEmail: true,
      },
      { label: "Topic", value: escapeHtml(input.topic) },
    ],
    contentLabel: "Message",
    content: input.message.trim(),
  });
}

export function buildServiceRequestTicketDescription(
  input: SubmitServiceRequestDto,
  brandName: string,
): string {
  return buildZohoTicketDescription({
    brandName,
    headerSubtitle: "Request a service",
    details: [
      {
        label: "Email",
        value: escapeHtml(input.email.trim()),
        isEmail: true,
      },
      {
        label: "Service name",
        value: escapeHtml(input.serviceName.trim()),
      },
    ],
    contentLabel: "Description",
    content: input.description.trim(),
  });
}
