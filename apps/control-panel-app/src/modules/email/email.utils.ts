import * as fs from "fs";
import * as path from "path";

let cachedOtpEmailTemplate: string | null = null;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatOtp(otp: string): string {
  return otp.length === 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp;
}

export function renderEmailTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => values[key] ?? "",
  );
}

export function loadOtpEmailTemplate(): string {
  if (cachedOtpEmailTemplate) {
    return cachedOtpEmailTemplate;
  }

  cachedOtpEmailTemplate = fs.readFileSync(
    path.join(__dirname, "templates", "otp-email.html"),
    "utf-8",
  );

  return cachedOtpEmailTemplate;
}
