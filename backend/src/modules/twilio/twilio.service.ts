import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwilioService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<boolean>('twilio.configured'));
  }

  isWebhookSigningConfigured(): boolean {
    return Boolean(this.config.get<string>('twilio.authToken')?.trim());
  }

  getAccountSid(): string {
    return this.config.get<string>('twilio.accountSid', '');
  }

  getVoiceWebhookBaseUrl(): string {
    return this.config.get<string>('twilio.voiceWebhookBaseUrl', '');
  }
}
