import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpException } from '@nestjs/common/exceptions/http.exception';
import { TwilioControlPlaneClient } from './twilio-control-plane.client';
import { TwilioProviderError } from './errors/twilio-provider.errors';
import {
  mapTwilioSdkError,
  sanitizeTwilioLogMessage,
  toHttpSafeProviderMessage,
} from './errors/twilio-provider-error.mapper';
import { TwilioPhoneNumberRecord } from './twilio.types';
import { TwilioService } from './twilio.service';

/**
 * Parent-account telephony operations for control-plane / master-admin use only.
 * Tenant routes must use TwilioTelephonyService with organizationId.
 */
@Injectable()
export class TwilioControlPlaneTelephonyService {
  private readonly logger = new Logger(TwilioControlPlaneTelephonyService.name);

  constructor(
    private readonly controlPlaneClient: TwilioControlPlaneClient,
    private readonly twilio: TwilioService,
  ) {}

  isConfigured(): boolean {
    return this.controlPlaneClient.isConfigured();
  }

  async checkHealth(): Promise<{
    configured: boolean;
    healthy: boolean;
    degraded: boolean;
    label: string;
    message?: string;
  }> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        healthy: false,
        degraded: false,
        label: 'Not configured',
        message: 'Twilio IE1 control-plane credentials are missing.',
      };
    }

    try {
      const client = this.controlPlaneClient.getClient();
      await client.api.v2010.accounts(client.accountSid).fetch();
      return {
        configured: true,
        healthy: true,
        degraded: false,
        label: 'Healthy',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Twilio health check failed';
      return {
        configured: true,
        healthy: false,
        degraded: true,
        label: 'Degraded',
        message,
      };
    }
  }

  async listParentPhoneNumbers(): Promise<TwilioPhoneNumberRecord[]> {
    const client = this.controlPlaneClient.getClient();
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
      return this.handleProviderError('listParentPhoneNumbers', err);
    }
  }

  private handleProviderError(operation: string, err: unknown): never {
    const mapped = err instanceof TwilioProviderError ? err : mapTwilioSdkError(err);
    const safeMessage = sanitizeTwilioLogMessage(mapped.message);
    this.logger.warn(`Twilio control-plane ${operation} failed: ${safeMessage}`);
    if (mapped instanceof TwilioProviderError) {
      throw new BadGatewayException(toHttpSafeProviderMessage(mapped));
    }
    if (err instanceof HttpException) {
      throw err;
    }
    throw new BadGatewayException(safeMessage);
  }
}
