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
