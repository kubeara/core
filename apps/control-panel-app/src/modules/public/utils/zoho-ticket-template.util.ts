import * as fs from "fs";
import * as path from "path";

import {
  escapeHtml,
  renderEmailTemplate,
} from "@control-panel/modules/email/email.utils";

import {
  ZOHO_TICKET_FOOTER,
  ZOHO_TICKET_SOCIAL_LINKS,
  ZOHO_TICKET_THEME,
  ZOHO_TICKET_TYPE_CONFIG,
  ZohoTicketType,
} from "../constants/zoho-ticket.constants";
import { SubmitServiceRequestDto } from "../dto/submit-service-request.dto";
import { SubmitSupportRequestDto } from "../dto/submit-support-request.dto";

const TEMPLATE_FILE = "zoho-ticket-description.html";

let cachedTemplate: string | null = null;
let cachedLogoDataUri: string | null = null;

interface ZohoTicketDetailRow {
  label: string;
  value: string;
  isEmail?: boolean;
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
    path.join(__dirname, "../assets", ZOHO_TICKET_THEME.logoFile),
  );
  cachedLogoDataUri = `data:image/webp;base64,${logoBuffer.toString("base64")}`;

  return cachedLogoDataUri;
}

function buildDetailsRows(details: ZohoTicketDetailRow[]): string {
  const theme = ZOHO_TICKET_THEME;

  return details
    .map((detail, index) => {
      const isLast = index === details.length - 1;
      const borderStyle = isLast
        ? ""
        : `border-bottom:1px solid ${theme.detailsBorder};`;
      const valueCell = detail.isEmail
        ? `<a href="mailto:${detail.value}" style="color:${theme.emailLinkColor};text-decoration:none;">${detail.value}</a>`
        : detail.value;

      return [
        "<tr>",
        `<td style="width:140px;padding:12px 16px;background-color:${theme.detailsLabelBackground};${borderStyle}font-size:13px;font-weight:600;color:${theme.detailsLabelColor};">${detail.label}</td>`,
        `<td style="padding:12px 16px;${borderStyle}font-size:14px;color:${theme.detailsValueColor};">${valueCell}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");
}

function buildSocialIcons(): string {
  const theme = ZOHO_TICKET_THEME;

  return ZOHO_TICKET_SOCIAL_LINKS.map((link, index) => {
    const paddingLeft = index === 0 ? "0" : "12px";

    return [
      `<td style="padding-left:${paddingLeft};">`,
      `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(link.label)}" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;background-color:${theme.socialIconBackground};border:1px solid ${theme.socialIconBorder};border-radius:8px;text-decoration:none;">`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${theme.socialIconFill}" style="vertical-align:middle;">`,
      `<path d="${link.iconPath}"></path>`,
      "</svg>",
      "</a>",
      "</td>",
    ].join("");
  }).join("");
}

export function buildZohoTicketDescription(
  type: ZohoTicketType,
  input: SubmitSupportRequestDto | SubmitServiceRequestDto,
  brandName: string,
): string {
  const config = ZOHO_TICKET_TYPE_CONFIG[type];
  const theme = ZOHO_TICKET_THEME;

  const details: ZohoTicketDetailRow[] =
    type === "support"
      ? [
          {
            label: "Name",
            value: escapeHtml((input as SubmitSupportRequestDto).name.trim()),
          },
          {
            label: "Email",
            value: escapeHtml(
              (input as SubmitSupportRequestDto).email.trim(),
            ),
            isEmail: true,
          },
          {
            label: "Topic",
            value: escapeHtml((input as SubmitSupportRequestDto).topic),
          },
        ]
      : [
          {
            label: "Email",
            value: escapeHtml(
              (input as SubmitServiceRequestDto).email.trim(),
            ),
            isEmail: true,
          },
          {
            label: "Service name",
            value: escapeHtml(
              (input as SubmitServiceRequestDto).serviceName.trim(),
            ),
          },
        ];

  const content =
    type === "support"
      ? escapeHtml((input as SubmitSupportRequestDto).message.trim())
      : escapeHtml((input as SubmitServiceRequestDto).description.trim());

  return renderEmailTemplate(loadTemplate(), {
    brandName: escapeHtml(brandName),
    logoDataUri: getLogoDataUri(),
    headerSubtitle: escapeHtml(config.headerSubtitle),
    headerSubtitleColor: theme.headerSubtitleColor,
    outerBackground: theme.outerBackground,
    cardBackground: theme.cardBackground,
    cardBorder: theme.cardBorder,
    sectionLabelColor: theme.sectionLabelColor,
    detailsBorder: theme.detailsBorder,
    contentBackground: theme.contentBackground,
    contentBorder: theme.contentBorder,
    contentColor: theme.contentColor,
    footerBackground: theme.footerBackground,
    footerBorder: theme.footerBorder,
    footerTextColor: theme.footerTextColor,
    footerMutedColor: theme.footerMutedColor,
    detailsRows: buildDetailsRows(details),
    contentLabel: escapeHtml(config.contentLabel),
    content,
    socialIcons: buildSocialIcons(),
    copyrightLine1: escapeHtml(ZOHO_TICKET_FOOTER.copyrightLine1),
    copyrightLine2: escapeHtml(ZOHO_TICKET_FOOTER.copyrightLine2),
    submittedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
  });
}
