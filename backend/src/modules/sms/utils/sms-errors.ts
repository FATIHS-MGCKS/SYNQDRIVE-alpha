import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';

export const SMS_ERROR_CODES = {
  PROVIDER_NOT_CONFIGURED: 'SMS_PROVIDER_NOT_CONFIGURED',
  CONSENT_OPTED_OUT: 'SMS_CONSENT_OPTED_OUT',
  CHANNEL_INACTIVE: 'SMS_CHANNEL_INACTIVE',
} as const;

export class SmsProviderNotConfiguredException extends ServiceUnavailableException {
  constructor(message = 'SMS provider is not configured for this organization') {
    super({ code: SMS_ERROR_CODES.PROVIDER_NOT_CONFIGURED, message });
  }
}

export class SmsConsentBlockedException extends ForbiddenException {
  constructor(reason: string) {
    super({ code: SMS_ERROR_CODES.CONSENT_OPTED_OUT, message: reason });
  }
}

export class SmsChannelInactiveException extends BadRequestException {
  constructor(message = 'SMS channel is not active for this organization') {
    super({ code: SMS_ERROR_CODES.CHANNEL_INACTIVE, message });
  }
}
