import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailProviderPort,
  EmailSendPayload,
  EmailSendResult,
} from '../email-provider.port';
import { ResendApiClient, ResendApiError } from './resend-api.client';

@Injectable()
export class ResendEmailProvider implements EmailProviderPort {
  readonly providerId = 'resend';
  private readonly logger = new Logger(ResendEmailProvider.name);

  constructor(private readonly client: ResendApiClient) {}

  async send(payload: EmailSendPayload): Promise<EmailSendResult> {
    if (!this.client.isConfigured()) {
      return {
        success: false,
        errorMessage: 'Resend API key is not configured',
      };
    }

    try {
      const from = payload.fromName
        ? `${payload.fromName} <${payload.fromEmail}>`
        : payload.fromEmail;

      const response = await this.client.sendEmail({
        from,
        to: [payload.to],
        cc: payload.cc?.length ? payload.cc : undefined,
        bcc: payload.bcc?.length ? payload.bcc : undefined,
        reply_to: payload.replyToEmail,
        subject: payload.subject,
        text: payload.bodyText,
        html: payload.bodyHtml,
        attachments: payload.attachments?.map((attachment) => ({
          filename: attachment.fileName,
          content: attachment.content.toString('base64'),
        })),
      });

      this.logger.log(
        JSON.stringify({
          event: 'resend_email_sent',
          providerMessageId: response.id,
          to: payload.to,
          subject: payload.subject,
          attachmentCount: payload.attachments?.length ?? 0,
        }),
      );

      return {
        success: true,
        providerMessageId: response.id,
        simulated: false,
      };
    } catch (err) {
      const message = this.mapError(err);
      this.logger.warn(
        JSON.stringify({
          event: 'resend_email_failed',
          to: payload.to,
          subject: payload.subject,
          error: message,
        }),
      );
      return {
        success: false,
        errorMessage: message,
      };
    }
  }

  private mapError(err: unknown): string {
    if (err instanceof ResendApiError) {
      if (err.statusCode === 401 || err.statusCode === 403) {
        return 'E-Mail-Versand nicht autorisiert — API-Schlüssel prüfen.';
      }
      if (err.statusCode === 422) {
        return err.message || 'Ungültige E-Mail-Anfrage.';
      }
      if (err.statusCode >= 500) {
        return 'E-Mail-Provider vorübergehend nicht erreichbar.';
      }
      return err.message;
    }
    if (err instanceof Error) return err.message;
    return 'E-Mail-Versand fehlgeschlagen';
  }
}
