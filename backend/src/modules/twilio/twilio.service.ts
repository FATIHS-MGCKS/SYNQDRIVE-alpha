import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Twilio } from 'twilio';
import {
  TWILIO_DEFAULT_EDGE,
  TWILIO_DEFAULT_REGION,
  getTwilioClient,
  resetTwilioClientForTests,
} from '@config/index';

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

  getClient(): Twilio | null {
    if (!this.isConfigured()) {
      return null;
    }
    return getTwilioClient({
      accountSid: this.config.get<string>('twilio.accountSid'),
      apiKeySid: this.config.get<string>('twilio.apiKeySid'),
      apiKeySecret: this.config.get<string>('twilio.apiKeySecret'),
      region: this.config.get<string>('twilio.region') ?? TWILIO_DEFAULT_REGION,
      edge: this.config.get<string>('twilio.edge') ?? TWILIO_DEFAULT_EDGE,
    });
  }

  resetClientForTests(): void {
    resetTwilioClientForTests();
  }
}
