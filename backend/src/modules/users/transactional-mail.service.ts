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

function maskRecipientForLog(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***@${email.slice(at + 1)}`;
}

/**
 * Transactional mail — production-ready contract with safe dev fallback.
 * Invite URLs and tokens are never written to logs.
 */
@Injectable()
export class TransactionalMailService {
  private readonly logger = new Logger(TransactionalMailService.name);

  async sendOrganizationInvite(input: SendInviteMailInput): Promise<MailSendResult> {
    const smtpHost = process.env.SMTP_HOST?.trim();
    const from = process.env.MAIL_FROM?.trim() || 'noreply@synqdrive.local';
    const subject = `Einladung zu ${input.organizationName} — SynqDrive`;

    if (smtpHost) {
      this.logger.warn(
        `SMTP_HOST is set but provider adapter is not configured yet — using fallback log for ${maskRecipientForLog(input.to)}`,
      );
    }

    this.logger.log(
      `[mail] invite queued → recipient=${maskRecipientForLog(input.to)} | org=${input.organizationName} | expires=${input.expiresAt.toISOString()} | from=${from} | subject=${subject}`,
    );

    return { sent: false, fallback: true, provider: smtpHost ? 'smtp-pending' : 'log' };
  }

  async sendPasswordReset(input: SendPasswordResetMailInput): Promise<MailSendResult> {
    const from = process.env.MAIL_FROM?.trim() || 'noreply@synqdrive.local';
    const subject = 'SynqDrive — Passwort zurücksetzen';

    this.logger.log(
      `[mail] password-reset queued → ${maskRecipientForLog(input.to)} | purpose=${input.purpose} | expires=${input.expiresAt.toISOString()} | from=${from} | subject=${subject}`,
    );

    return { sent: false, fallback: true, provider: 'log' };
  }

  async sendPasswordResetCompleted(
    input: SendPasswordResetCompletedMailInput,
  ): Promise<MailSendResult> {
    this.logger.log(
      `[mail] password-reset-completed notification → ${maskRecipientForLog(input.to)}`,
    );
    return { sent: false, fallback: true, provider: 'log' };
  }
}
