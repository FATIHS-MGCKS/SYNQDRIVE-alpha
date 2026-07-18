import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Twilio } from 'twilio';
import { createTwilioClient, createTwilioAccountsManagementClient, TWILIO_DEFAULT_EDGE, TWILIO_DEFAULT_REGION } from '@config/index';
import { TwilioInvalidConfigurationError, TwilioRegionMismatchError } from './errors/twilio-provider.errors';

/** Marker service — inject only from control-plane / master-admin modules. */
export const TWILIO_CONTROL_PLANE_CLIENT = Symbol('TWILIO_CONTROL_PLANE_CLIENT');

@Injectable()
export class TwilioControlPlaneClient {
  private cachedClient: Twilio | null = null;
  private cachedAccountsClient: Twilio | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<boolean>('twilio.configured'));
  }

  getRequiredRegion(): string {
    return TWILIO_DEFAULT_REGION;
  }

  getRequiredEdge(): string {
    return TWILIO_DEFAULT_EDGE;
  }

  getClient(): Twilio {
    this.assertRegionConfiguration();
    if (!this.cachedClient) {
      const client = createTwilioClient({
        accountSid: this.config.get<string>('twilio.accountSid'),
        apiKeySid: this.config.get<string>('twilio.apiKeySid'),
        apiKeySecret: this.config.get<string>('twilio.apiKeySecret'),
        region: this.getRequiredRegion(),
        edge: this.getRequiredEdge(),
      });
      if (!client) {
        throw new TwilioInvalidConfigurationError('Twilio control-plane credentials are incomplete.');
      }
      this.cachedClient = client;
    }
    return this.cachedClient;
  }

  /** US-routed client for Account Admin API (subaccount provisioning). */
  getAccountsManagementClient(): Twilio {
    if (!this.cachedAccountsClient) {
      const client = createTwilioAccountsManagementClient({
        accountSid: this.config.get<string>('twilio.accountSid'),
        authToken: this.config.get<string>('twilio.authToken'),
        apiKeySid: this.config.get<string>('twilio.apiKeySid'),
        apiKeySecret: this.config.get<string>('twilio.apiKeySecret'),
      });
      if (!client) {
        throw new TwilioInvalidConfigurationError('Twilio control-plane credentials are incomplete.');
      }
      this.cachedAccountsClient = client;
    }
    return this.cachedAccountsClient;
  }

  resetClientForTests(): void {
    this.cachedClient = null;
    this.cachedAccountsClient = null;
  }

  private assertRegionConfiguration(): void {
    const region = (this.config.get<string>('twilio.region') ?? TWILIO_DEFAULT_REGION).trim().toLowerCase();
    const edge = (this.config.get<string>('twilio.edge') ?? TWILIO_DEFAULT_EDGE).trim().toLowerCase();
    if (region !== TWILIO_DEFAULT_REGION || edge !== TWILIO_DEFAULT_EDGE) {
      throw new TwilioRegionMismatchError(
        `Control-plane Twilio routing must use region ${TWILIO_DEFAULT_REGION} and edge ${TWILIO_DEFAULT_EDGE}.`,
      );
    }
  }
}
