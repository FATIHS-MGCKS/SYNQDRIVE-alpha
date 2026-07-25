import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { TwilioTenantClientFactory } from '@modules/twilio/twilio-tenant-client.factory';
import { TwilioService } from '@modules/twilio/twilio.service';
import { buildTwilioWebhookUrl } from '@modules/twilio/twilio-signature.util';
import { SmsChannelInactiveException, SmsProviderNotConfiguredException } from './utils/sms-errors';

export interface SmsSenderResolution {
  messagingServiceSid?: string;
  fromE164?: string;
  fromSenderRef: string;
  fromMasked?: string | null;
}

export interface TwilioSmsSendResult {
  providerMessageSid: string;
  status: 'SENT' | 'SENT_SIMULATED' | 'FAILED';
  failureReason?: string;
  segmentCount?: number;
}

@Injectable()
export class SmsMessagingService {
  private readonly logger = new Logger(SmsMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly twilio: TwilioService,
    private readonly tenantClientFactory: TwilioTenantClientFactory,
  ) {}

  isSimulateEnabled(): boolean {
    return (
      this.config.get<boolean>('twilio.smsSimulateEnabled') === true
      || (process.env.NODE_ENV !== 'production' && process.env.TWILIO_SMS_SIMULATE_ENABLED !== 'false')
    );
  }

  resolveMessageStatusCallbackUrl(): string | null {
    const base = this.twilio.getVoiceWebhookBaseUrl().trim();
    if (!base) return null;
    return buildTwilioWebhookUrl(base, '/api/v1/webhooks/twilio/message-status');
  }

  async resolveSender(organizationId: string): Promise<SmsSenderResolution> {
    const orgConfig = await this.prisma.orgSmsConfig.findUnique({
      where: { organizationId },
    });
    if (!orgConfig?.isActive) {
      throw new SmsChannelInactiveException();
    }

    if (orgConfig.messagingServiceSid?.trim()) {
      return {
        messagingServiceSid: orgConfig.messagingServiceSid.trim(),
        fromSenderRef: `MG:${orgConfig.messagingServiceSid.trim()}`,
        fromMasked: orgConfig.fromMaskedNumber,
      };
    }

    if (orgConfig.fromPhoneNumberSid?.trim()) {
      const configured = await this.isConfiguredForOrganization(organizationId);
      if (!configured && !this.isSimulateEnabled()) {
        throw new SmsProviderNotConfiguredException();
      }
      if (this.isSimulateEnabled()) {
        return {
          fromE164: '+49000000000',
          fromSenderRef: orgConfig.fromPhoneNumberSid.trim(),
          fromMasked: orgConfig.fromMaskedNumber ?? '+49***0000',
        };
      }
      const client = await this.tenantClientFactory.getClientForOrganization(organizationId);
      const row = await client.incomingPhoneNumbers(orgConfig.fromPhoneNumberSid.trim()).fetch();
      if (!row.phoneNumber) {
        throw new SmsProviderNotConfiguredException('Configured Twilio from number is unavailable.');
      }
      return {
        fromE164: row.phoneNumber,
        fromSenderRef: orgConfig.fromPhoneNumberSid.trim(),
        fromMasked: orgConfig.fromMaskedNumber ?? row.phoneNumber.replace(/\d(?=\d{4})/g, '*'),
      };
    }

    throw new SmsProviderNotConfiguredException(
      'Org SMS config requires messagingServiceSid or fromPhoneNumberSid.',
    );
  }

  async isConfiguredForOrganization(organizationId: string): Promise<boolean> {
    const orgConfig = await this.prisma.orgSmsConfig.findUnique({
      where: { organizationId },
      select: { isActive: true },
    });
    if (!orgConfig?.isActive) return false;
    if (this.isSimulateEnabled()) return true;
    return this.tenantClientFactory.isConfiguredForOrganization(organizationId);
  }

  async sendSms(
    organizationId: string,
    params: {
      toE164: string;
      body: string;
      sender: SmsSenderResolution;
    },
  ): Promise<TwilioSmsSendResult> {
    if (this.isSimulateEnabled()) {
      const sid = `SM_SIM_${Date.now()}`;
      this.logger.log(`SMS simulate org=${organizationId} to=${params.toE164.slice(0, 6)}***`);
      return { providerMessageSid: sid, status: 'SENT_SIMULATED' };
    }

    const configured = await this.isConfiguredForOrganization(organizationId);
    if (!configured) {
      throw new SmsProviderNotConfiguredException();
    }

    const client = await this.tenantClientFactory.getClientForOrganization(organizationId);
    const statusCallback = this.resolveMessageStatusCallbackUrl();

    try {
      const createParams: Record<string, string> = {
        to: params.toE164.replace(/\s/g, ''),
        body: params.body,
      };
      if (params.sender.messagingServiceSid) {
        createParams.messagingServiceSid = params.sender.messagingServiceSid;
      } else if (params.sender.fromE164) {
        createParams.from = params.sender.fromE164;
      }
      if (statusCallback) {
        createParams.statusCallback = statusCallback;
        createParams.statusCallbackMethod = 'POST';
      }

      const message = await client.messages.create(createParams as never);
      if (!message.sid) {
        return { providerMessageSid: '', status: 'FAILED', failureReason: 'No MessageSid returned' };
      }
      return {
        providerMessageSid: message.sid,
        status: 'SENT',
        segmentCount: message.numSegments ? Number(message.numSegments) : undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.tenantClientFactory.logProviderFailure(organizationId, 'sendSms', err);
      return { providerMessageSid: '', status: 'FAILED', failureReason: message };
    }
  }
}
