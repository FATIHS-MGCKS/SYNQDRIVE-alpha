import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { VoicePstnProvider } from '@prisma/client';
import { TwilioService } from './twilio.service';
import { TwilioPhoneNumberRecord } from './twilio.types';
import {
  buildTwilioWebhookUrl,
} from './twilio-signature.util';
import { buildOutboundVoiceTwiml } from './twilio-voice-twiml.util';

@Injectable()
export class TwilioTelephonyService {
  private readonly logger = new Logger(TwilioTelephonyService.name);

  constructor(private readonly twilio: TwilioService) {}

  isConfigured(): boolean {
    return this.twilio.isConfigured();
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

  async listPhoneNumbers(): Promise<TwilioPhoneNumberRecord[]> {
    const client = this.twilio.getClient();
    if (!client) {
      return [];
    }

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
      const message = err instanceof Error ? err.message : 'Unknown Twilio error';
      this.logger.warn(`Twilio listPhoneNumbers failed: ${message}`);
      throw new BadGatewayException(`Twilio phone number list failed: ${message}`);
    }
  }

  async configureInboundWebhooks(phoneNumberSid: string): Promise<void> {
    const client = this.twilio.getClient();
    const urls = this.resolveVoiceWebhookUrls();
    if (!client) {
      throw new ServiceUnavailableException('Twilio is not configured on the server.');
    }
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
      const message = err instanceof Error ? err.message : 'Unknown Twilio error';
      this.logger.warn(`Twilio configureInboundWebhooks failed: ${message}`);
      throw new BadGatewayException(`Twilio webhook configuration failed: ${message}`);
    }
  }

  async clearInboundWebhooks(phoneNumberSid: string): Promise<void> {
    const client = this.twilio.getClient();
    if (!client) {
      throw new ServiceUnavailableException('Twilio is not configured on the server.');
    }

    try {
      await client.incomingPhoneNumbers(phoneNumberSid).update({
        voiceUrl: '',
        statusCallback: '',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Twilio error';
      this.logger.warn(`Twilio clearInboundWebhooks failed: ${message}`);
      throw new BadGatewayException(`Twilio webhook clear failed: ${message}`);
    }
  }

  async initiateOutboundCall(params: {
    from: string;
    to: string;
    twimlMessage: string;
  }): Promise<{ callSid: string }> {
    const client = this.twilio.getClient();
    const urls = this.resolveVoiceWebhookUrls();
    if (!client) {
      throw new ServiceUnavailableException('Twilio is not configured on the server.');
    }
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
      const message = err instanceof Error ? err.message : 'Unknown Twilio error';
      this.logger.warn(`Twilio initiateOutboundCall failed: ${message}`);
      throw new BadGatewayException(`Twilio outbound call failed: ${message}`);
    }
  }

  static pstnProviderLabel(provider: VoicePstnProvider): 'elevenlabs' | 'twilio' {
    return provider === VoicePstnProvider.TWILIO ? 'twilio' : 'elevenlabs';
  }
}
