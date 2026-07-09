import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  EmailProviderPort,
  EmailSendPayload,
  EmailSendResult,
} from './email-provider.port';

@Injectable()
export class DevEmailProvider implements EmailProviderPort {
  readonly providerId = 'dev';
  private readonly logger = new Logger(DevEmailProvider.name);

  async send(payload: EmailSendPayload): Promise<EmailSendResult> {
    const attachmentSummary = (payload.attachments ?? []).map((a) => ({
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes ?? a.content.length,
    }));

    this.logger.log(
      JSON.stringify({
        event: 'dev_email_send',
        provider: this.providerId,
        from: `${payload.fromName} <${payload.fromEmail}>`,
        replyTo: payload.replyToEmail,
        to: payload.to,
        cc: payload.cc ?? [],
        bcc: payload.bcc ?? [],
        subject: payload.subject,
        bodyTextPreview: payload.bodyText.slice(0, 240),
        hasHtml: Boolean(payload.bodyHtml),
        attachments: attachmentSummary,
      }),
    );

    return {
      success: true,
      simulated: true,
      providerMessageId: `dev-${randomUUID()}`,
    };
  }
}
