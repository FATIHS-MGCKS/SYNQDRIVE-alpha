import { Injectable, Logger } from '@nestjs/common';

export interface SendInviteMailInput {
  to: string;
  organizationName: string;
  inviteUrl: string;
  expiresAt: Date;
  invitedByName?: string;
}

export interface SendPasswordResetMailInput {
  to: string;
  resetUrl: string;
  expiresAt: Date;
  purpose: 'ADMIN_INITIATED' | 'SELF_SERVICE';
}

export interface SendPasswordResetCompletedMailInput {
  to: string;
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

  async sendPasswordReset(input: SendPasswordResetMailInput): Promise<MailSendResult> {
    const from = process.env.MAIL_FROM?.trim() || 'noreply@synqdrive.local';
    const subject = 'SynqDrive — Passwort zurücksetzen';

    // Do not log resetUrl or token — email channel only.
    this.logger.log(
      `[mail] password-reset queued → ${input.to} | purpose=${input.purpose} | expires=${input.expiresAt.toISOString()} | from=${from} | subject=${subject}`,
    );

    return { sent: false, fallback: true, provider: 'log' };
  }

  async sendPasswordResetCompleted(
    input: SendPasswordResetCompletedMailInput,
  ): Promise<MailSendResult> {
    this.logger.log(
      `[mail] password-reset-completed notification → ${input.to}`,
    );
    return { sent: false, fallback: true, provider: 'log' };
  }
}
