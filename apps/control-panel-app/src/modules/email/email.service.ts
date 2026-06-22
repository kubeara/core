import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BrevoClient } from "@getbrevo/brevo";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatOtp(otp: string): string {
  return otp.length === 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp;
}

@Injectable()
export class EmailService {
  private readonly brevo: BrevoClient;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>("BREVO_API_KEY");

    this.fromEmail = this.configService.getOrThrow<string>("BREVO_FROM_EMAIL");
    this.fromName =
      this.configService.get<string>("BREVO_FROM_NAME") ?? "Kubeara";

    this.brevo = new BrevoClient({ apiKey });
  }

  private buildOtpEmailHtml(input: {
    toName?: string;
    otp: string;
    purposeLabel: string;
  }): string {
    const greeting = input.toName
      ? `Hi ${escapeHtml(input.toName)},`
      : "Hi there,";
    const purpose = escapeHtml(input.purposeLabel);
    const formattedOtp = escapeHtml(formatOtp(input.otp));
    const brandName = escapeHtml(this.fromName);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${purpose} code</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:28px 32px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${brandName}</p>
              <p style="margin:8px 0 0;font-size:14px;color:#dbeafe;">Secure one-time verification</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:16px;line-height:1.5;color:#374151;">${greeting}</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
                Use the code below to complete your <strong style="color:#111827;">${purpose}</strong>.
                This code is valid for a limited time and can only be used once.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding:20px;background-color:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;">
                    <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Your verification code</p>
                    <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:0.2em;color:#1d4ed8;font-family:'SFMono-Regular',Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;">${formattedOtp}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">
                Enter this code in the app to continue. If you did not request this, you can safely ignore this email.
                Your account will remain unchanged.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
                This is an automated message from ${brandName}. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  async sendOtpEmail(input: {
    toEmail: string;
    toName?: string;
    otp: string;
    purposeLabel: string;
  }): Promise<void> {
    const subject = `Your ${input.purposeLabel} code`;
    const htmlContent = this.buildOtpEmailHtml(input);

    await this.brevo.transactionalEmails.sendTransacEmail({
      subject,
      htmlContent,
      sender: {
        email: this.fromEmail,
        name: this.fromName,
      },
      to: [
        {
          email: input.toEmail,
          ...(input.toName ? { name: input.toName } : {}),
        },
      ],
    });
  }
}
