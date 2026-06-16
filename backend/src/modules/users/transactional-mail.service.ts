import { Injectable, Logger } from '@nestjs/common';

export interface SendInviteMailInput {
  to: string;
  organizationName: string;
  inviteUrl: string;
  expiresAt: Date;
  invitedByName?: string;
}

export interface MailSendResult {
  sent: boolean;
  fallback: boolean;
  provider?: string;
}

/**
 * Transactional mail — production-ready contract with safe dev fallback.
 * Wire SMTP/SendGrid/SES when credentials are configured.
 */
@Injectable()
export class TransactionalMailService {
  private readonly logger = new Logger(TransactionalMailService.name);

  async sendOrganizationInvite(input: SendInviteMailInput): Promise<MailSendResult> {
    const smtpHost = process.env.SMTP_HOST?.trim();
    const from = process.env.MAIL_FROM?.trim() || 'noreply@synqdrive.local';
    const subject = `Einladung zu ${input.organizationName} — SynqDrive`;

    const body = [
      `Sie wurden eingeladen, ${input.organizationName} auf SynqDrive beizutreten.`,
      input.invitedByName ? `Eingeladen von: ${input.invitedByName}` : '',
      `Link (gültig bis ${input.expiresAt.toISOString()}):`,
      input.inviteUrl,
    ]
      .filter(Boolean)
      .join('\n');

    if (smtpHost) {
      // Placeholder for real provider wiring — keeps API stable without faking success.
      this.logger.warn(
        `SMTP_HOST is set but provider adapter is not configured yet — using fallback log for ${input.to}`,
      );
    }

    this.logger.log(
      `[mail-fallback] invite → ${input.to} | org=${input.organizationName} | from=${from} | subject=${subject}`,
    );
    this.logger.debug(`[mail-fallback-body]\n${body}`);

    return { sent: false, fallback: true, provider: smtpHost ? 'smtp-pending' : 'log' };
  }
}
