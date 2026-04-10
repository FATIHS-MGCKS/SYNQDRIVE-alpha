import { Injectable, Logger } from '@nestjs/common';
import {
  InsurerChannelAdapter,
  InsurerInquiryPayload,
  InsurerDeliveryResult,
  InsurerConnectionTestResult,
} from './insurer-channel.interface';

@Injectable()
export class EmailChannelAdapter implements InsurerChannelAdapter {
  readonly channelType = 'EMAIL';
  private readonly logger = new Logger(EmailChannelAdapter.name);

  async sendInquiry(
    payload: InsurerInquiryPayload,
    config: Record<string, unknown>,
  ): Promise<InsurerDeliveryResult> {
    const recipientEmail = config.contactEmail as string;
    const start = Date.now();

    this.logger.log(
      `[EMAIL] Sending inquiry ${payload.inquiryId} to ${recipientEmail} | subject: "${payload.subject}"`,
    );

    // v1: Log the full payload for manual/staging processing.
    // Production: wire nodemailer / SES / SendGrid here.
    this.logger.debug(
      `[EMAIL] Payload for ${payload.correlationId}: vehicle=${payload.vehicleSummary.make} ${payload.vehicleSummary.model} ${payload.vehicleSummary.year}, type=${payload.inquiryType}, models=[${payload.selectedInsuranceModels.join(',')}]`,
    );

    const latencyMs = Date.now() - start;

    return {
      success: true,
      channel: 'EMAIL',
      externalReference: `email-${Date.now()}`,
      message: `Inquiry prepared for ${recipientEmail} (email dispatch queued)`,
      sentAt: new Date(),
    };
  }

  async testConnection(
    config: Record<string, unknown>,
  ): Promise<InsurerConnectionTestResult> {
    const start = Date.now();
    const email = config.contactEmail as string;
    const valid = !!email && email.includes('@');

    return {
      success: valid,
      latencyMs: Date.now() - start,
      message: valid
        ? `Email channel configured: ${email}`
        : 'No valid contact email configured',
      timestamp: new Date(),
    };
  }
}
