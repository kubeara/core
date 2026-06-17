import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BrevoClient } from "@getbrevo/brevo";

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

  async sendOtpEmail(input: {
    toEmail: string;
    toName?: string;
    otp: string;
    purposeLabel: string;
  }): Promise<void> {
    const subject = `${input.purposeLabel} OTP`;
    const htmlContent = `
      <p>Your verification code is:</p>
      <p><strong>${input.otp}</strong></p>
      <p>This code expires soon. If you did not request it, you can ignore this email.</p>
    `;

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
