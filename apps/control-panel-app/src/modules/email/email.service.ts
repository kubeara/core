import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BrevoClient } from "@getbrevo/brevo";
import { OTP_EMAIL_COPY } from "./email.constants";
import {
  escapeHtml,
  formatOtp,
  loadOtpEmailTemplate,
  renderEmailTemplate,
} from "./email.utils";

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
    const purpose = escapeHtml(input.purposeLabel);
    const brandName = escapeHtml(this.fromName);
    const greeting = input.toName
      ? `Hi ${escapeHtml(input.toName)},`
      : OTP_EMAIL_COPY.GREETING_FALLBACK;

    return renderEmailTemplate(loadOtpEmailTemplate(), {
      title: `${purpose} code`,
      brandName,
      headerSubtitle: OTP_EMAIL_COPY.HEADER_SUBTITLE,
      greeting,
      instructionPrefix: OTP_EMAIL_COPY.INSTRUCTION_PREFIX,
      purpose,
      validityNote: OTP_EMAIL_COPY.VALIDITY_NOTE,
      codeLabel: OTP_EMAIL_COPY.CODE_LABEL,
      formattedOtp: escapeHtml(formatOtp(input.otp)),
      disclaimer: OTP_EMAIL_COPY.DISCLAIMER,
      footer: `${OTP_EMAIL_COPY.FOOTER_PREFIX} ${brandName}. ${OTP_EMAIL_COPY.FOOTER_SUFFIX}`,
    });
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
