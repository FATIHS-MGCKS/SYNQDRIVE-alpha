import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';

export const WHATSAPP_ERROR_CODES = {
  PROVIDER_NOT_CONFIGURED: 'WHATSAPP_PROVIDER_NOT_CONFIGURED',
  CONSENT_OPTED_OUT: 'WHATSAPP_CONSENT_OPTED_OUT',
  FREE_TEXT_BLOCKED: 'WHATSAPP_FREE_TEXT_BLOCKED',
  TEMPLATE_NOT_APPROVED: 'WHATSAPP_TEMPLATE_NOT_APPROVED',
  POLICY_BLOCKED: 'WHATSAPP_POLICY_BLOCKED',
  SIMULATION_DISABLED: 'WHATSAPP_SIMULATION_DISABLED',
  DUPLICATE_WEBHOOK: 'WHATSAPP_DUPLICATE_WEBHOOK',
} as const;

export class WhatsAppProviderNotConfiguredException extends ServiceUnavailableException {
  constructor(message = 'WhatsApp provider is not configured for this organization') {
    super({ code: WHATSAPP_ERROR_CODES.PROVIDER_NOT_CONFIGURED, message });
  }
}

export class WhatsAppConsentBlockedException extends ForbiddenException {
  constructor(reason: string) {
    super({ code: WHATSAPP_ERROR_CODES.CONSENT_OPTED_OUT, message: reason });
  }
}

export class WhatsAppFreeTextBlockedException extends BadRequestException {
  constructor(reason: string) {
    super({ code: WHATSAPP_ERROR_CODES.FREE_TEXT_BLOCKED, message: reason });
  }
}

export class WhatsAppPolicyBlockedException extends ForbiddenException {
  constructor(reason: string, flags?: string[]) {
    super({
      code: WHATSAPP_ERROR_CODES.POLICY_BLOCKED,
      message: reason,
      sensitiveFlags: flags ?? [],
    });
  }
}

export class WhatsAppSimulationDisabledException extends ForbiddenException {
  constructor() {
    super({
      code: WHATSAPP_ERROR_CODES.SIMULATION_DISABLED,
      message: 'WhatsApp simulation is only available in development/test environments',
    });
  }
}
