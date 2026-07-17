import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpException } from '@nestjs/common/exceptions/http.exception';
import { VoicePstnProvider } from '@prisma/client';
import { TwilioTenantClientFactory } from './twilio-tenant-client.factory';
import { TwilioProviderError, TwilioProviderErrorCode } from './errors/twilio-provider.errors';
import {
  mapTwilioSdkError,
  sanitizeTwilioLogMessage,
  toHttpSafeProviderMessage,
} from './errors/twilio-provider-error.mapper';
import { TwilioPhoneNumberRecord } from './twilio.types';
import {
  buildTwilioWebhookUrl,
} from './twilio-signature.util';
import { buildOutboundVoiceTwiml } from './twilio-voice-twiml.util';
import { TwilioService } from './twilio.service';

@Injectable()
export class TwilioTelephonyService {
  private readonly logger = new Logger(TwilioTelephonyService.name);

  constructor(
    private readonly tenantClientFactory: TwilioTenantClientFactory,
    private readonly twilio: TwilioService,
  ) {}

  async isConfiguredForOrganization(organizationId: string): Promise<boolean> {
    return this.tenantClientFactory.isConfiguredForOrganization(organizationId);
  }

  resolveVoiceWebhookUrls(): { voiceUrl: string; statusUrl: string } | null {
    const base = this.twilio.getVoiceWebhookBaseUrl().trim();
    if (!base) {
      return null;
    }
    return {
      voiceUrl: buildTwilioWebhookUrl(base, '/api/v1/webhooks/twilio/voice'),
      statusUrl: buildTwilioWebhookUrl(base, '/api/v1/webhooks/twilio/status'),
    };
  }

  async listPhoneNumbers(organizationId: string): Promise<TwilioPhoneNumberRecord[]> {
    const client = await this.tenantClientFactory.getClientForOrganization(organizationId);
    try {
      const rows = await client.incomingPhoneNumbers.list({ limit: 100 });
      return rows.map((row) => ({
        phoneNumberSid: row.sid,
        phoneNumber: row.phoneNumber ?? null,
        friendlyName: row.friendlyName ?? null,
        voiceUrl: row.voiceUrl ?? null,
        statusCallback: row.statusCallback ?? null,
      }));
    } catch (err) {
      return this.handleProviderError(organizationId, 'listPhoneNumbers', err);
    }
  }

  async configureInboundWebhooks(organizationId: string, phoneNumberSid: string): Promise<void> {
    const client = await this.tenantClientFactory.getClientForOrganization(organizationId);
    const urls = this.resolveVoiceWebhookUrls();
    if (!urls) {
      throw new BadRequestException(
        'TWILIO_VOICE_WEBHOOK_BASE_URL is not configured. Set the public app base URL for voice webhooks.',
      );
    }

    try {
      await client.incomingPhoneNumbers(phoneNumberSid).update({
        voiceUrl: urls.voiceUrl,
        voiceMethod: 'POST',
        statusCallback: urls.statusUrl,
        statusCallbackMethod: 'POST',
      });
    } catch (err) {
      return this.handleProviderError(organizationId, 'configureInboundWebhooks', err);
    }
  }

  async clearInboundWebhooks(organizationId: string, phoneNumberSid: string): Promise<void> {
    const client = await this.tenantClientFactory.getClientForOrganization(organizationId);
    try {
      await client.incomingPhoneNumbers(phoneNumberSid).update({
        voiceUrl: '',
        statusCallback: '',
      });
    } catch (err) {
      return this.handleProviderError(organizationId, 'clearInboundWebhooks', err);
    }
  }

  async initiateOutboundCall(
    organizationId: string,
    params: {
      from: string;
      to: string;
      twimlMessage: string;
    },
  ): Promise<{ callSid: string }> {
    const client = await this.tenantClientFactory.getClientForOrganization(organizationId);
    const urls = this.resolveVoiceWebhookUrls();
    if (!urls) {
      throw new BadRequestException('TWILIO_VOICE_WEBHOOK_BASE_URL is not configured.');
    }

    try {
      const call = await client.calls.create({
        from: params.from,
        to: params.to,
        twiml: buildOutboundVoiceTwiml(params.twimlMessage),
        statusCallback: urls.statusUrl,
        statusCallbackMethod: 'POST',
      });
      return { callSid: call.sid };
    } catch (err) {
      return this.handleProviderError(organizationId, 'initiateOutboundCall', err);
    }
  }

  static pstnProviderLabel(provider: VoicePstnProvider): 'elevenlabs' | 'twilio' {
    return provider === VoicePstnProvider.TWILIO ? 'twilio' : 'elevenlabs';
  }

  private handleProviderError(organizationId: string, operation: string, err: unknown): never {
    if (err instanceof HttpException) {
      throw err;
    }
    const mapped = err instanceof TwilioProviderError ? err : mapTwilioSdkError(err);
    const safeMessage = sanitizeTwilioLogMessage(mapped.message);
    this.tenantClientFactory.logProviderFailure(organizationId, operation, mapped);
    this.logger.warn(
      `Twilio tenant ${operation} failed for org ${organizationId}: ${safeMessage}`,
    );
    if (mapped.code === TwilioProviderErrorCode.INVALID_CONFIGURATION) {
      throw new ServiceUnavailableException(toHttpSafeProviderMessage(mapped));
    }
    throw new BadGatewayException(toHttpSafeProviderMessage(mapped));
  }
}
