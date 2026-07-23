/**
 * Application scope dimensions for organization legal documents.
 *
 * SynqDrive stores administratively approved scope rules; it does not determine
 * which legal rule applies to a booking — that is resolved in Prompt 8.
 */

export const LEGAL_CUSTOMER_SEGMENT = {
  B2C: 'B2C',
  B2B: 'B2B',
  BOTH: 'BOTH',
} as const;

export type LegalCustomerSegment =
  (typeof LEGAL_CUSTOMER_SEGMENT)[keyof typeof LEGAL_CUSTOMER_SEGMENT];

export const LEGAL_CUSTOMER_SEGMENTS: readonly LegalCustomerSegment[] = Object.values(
  LEGAL_CUSTOMER_SEGMENT,
);

export const LEGAL_BOOKING_CHANNEL = {
  MANUAL: 'MANUAL',
  WEBSITE: 'WEBSITE',
  API: 'API',
  OPERATOR_APP: 'OPERATOR_APP',
  ALL: 'ALL',
} as const;

export type LegalBookingChannel =
  (typeof LEGAL_BOOKING_CHANNEL)[keyof typeof LEGAL_BOOKING_CHANNEL];

export const LEGAL_BOOKING_CHANNELS: readonly LegalBookingChannel[] = Object.values(
  LEGAL_BOOKING_CHANNEL,
);

export const LEGAL_STATION_SCOPE_MODE = {
  ORGANIZATION_WIDE: 'ORGANIZATION_WIDE',
  STATION_SPECIFIC: 'STATION_SPECIFIC',
} as const;

export type LegalStationScopeMode =
  (typeof LEGAL_STATION_SCOPE_MODE)[keyof typeof LEGAL_STATION_SCOPE_MODE];

export const LEGAL_STATION_SCOPE_MODES: readonly LegalStationScopeMode[] = Object.values(
  LEGAL_STATION_SCOPE_MODE,
);

export const LEGAL_NOTICE_PURPOSE = {
  TERMS_AND_CONDITIONS: 'TERMS_AND_CONDITIONS',
  PRIVACY_POLICY: 'PRIVACY_POLICY',
  WITHDRAWAL_RIGHT_NOTICE: 'WITHDRAWAL_RIGHT_NOTICE',
  NO_WITHDRAWAL_RIGHT_NOTICE: 'NO_WITHDRAWAL_RIGHT_NOTICE',
  OTHER_CONSUMER_INFORMATION: 'OTHER_CONSUMER_INFORMATION',
  GENERAL_NOTICE: 'GENERAL_NOTICE',
} as const;

export type LegalNoticePurpose =
  (typeof LEGAL_NOTICE_PURPOSE)[keyof typeof LEGAL_NOTICE_PURPOSE];

export const LEGAL_NOTICE_PURPOSES: readonly LegalNoticePurpose[] = Object.values(
  LEGAL_NOTICE_PURPOSE,
);

/** Re-export org business types allowed as product scope filter. */
export const LEGAL_PRODUCT_SCOPES = ['RENTAL', 'FLEET', 'TAXI', 'LOGISTICS', 'OTHER'] as const;

export type LegalProductScope = (typeof LEGAL_PRODUCT_SCOPES)[number];

export const LEGAL_SCOPE_PRIORITY_DEFAULT = 0;

export const LEGAL_SCOPE_PRIORITY_MIN = 0;
export const LEGAL_SCOPE_PRIORITY_MAX = 1000;

/** Documented defaults applied to legacy German legal documents during migration. */
export const LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS = {
  language: 'de',
  jurisdictionCountry: 'DE',
  customerSegment: LEGAL_CUSTOMER_SEGMENT.BOTH,
  bookingChannel: LEGAL_BOOKING_CHANNEL.ALL,
  productScope: null,
  stationScopeMode: LEGAL_STATION_SCOPE_MODE.ORGANIZATION_WIDE,
  priority: LEGAL_SCOPE_PRIORITY_DEFAULT,
  isMandatory: true,
} as const;

export function isLegalCustomerSegment(value: string): value is LegalCustomerSegment {
  return (LEGAL_CUSTOMER_SEGMENTS as string[]).includes(value);
}

export function isLegalBookingChannel(value: string): value is LegalBookingChannel {
  return (LEGAL_BOOKING_CHANNELS as string[]).includes(value);
}

export function isLegalStationScopeMode(value: string): value is LegalStationScopeMode {
  return (LEGAL_STATION_SCOPE_MODES as string[]).includes(value);
}

export function isLegalNoticePurpose(value: string): value is LegalNoticePurpose {
  return (LEGAL_NOTICE_PURPOSES as string[]).includes(value);
}

export function isLegalProductScope(value: string): value is LegalProductScope {
  return (LEGAL_PRODUCT_SCOPES as readonly string[]).includes(value);
}

/** Derive default notice purpose from canonical document type + variant. */
export function deriveNoticePurpose(
  documentType: string,
  legalVariant?: string | null,
): LegalNoticePurpose {
  if (documentType === 'TERMS_AND_CONDITIONS') {
    return LEGAL_NOTICE_PURPOSE.TERMS_AND_CONDITIONS;
  }
  if (documentType === 'PRIVACY_POLICY') {
    return LEGAL_NOTICE_PURPOSE.PRIVACY_POLICY;
  }
  if (legalVariant === 'WITHDRAWAL_RIGHT_NOTICE') {
    return LEGAL_NOTICE_PURPOSE.WITHDRAWAL_RIGHT_NOTICE;
  }
  if (legalVariant === 'NO_WITHDRAWAL_RIGHT_NOTICE') {
    return LEGAL_NOTICE_PURPOSE.NO_WITHDRAWAL_RIGHT_NOTICE;
  }
  if (documentType === 'CONSUMER_INFORMATION') {
    return LEGAL_NOTICE_PURPOSE.OTHER_CONSUMER_INFORMATION;
  }
  return LEGAL_NOTICE_PURPOSE.GENERAL_NOTICE;
}

/** Best-effort jurisdiction from standardized language code (no document content). */
export function deriveJurisdictionFromLanguageCode(language: string): string {
  const normalized = normalizeLanguageCode(language);
  if (normalized === 'at' || normalized.startsWith('de-at')) return 'AT';
  if (normalized === 'ch' || normalized.startsWith('de-ch')) return 'CH';
  return 'DE';
}

/** Normalize to lowercase primary language tag (ISO 639-1). */
export function normalizeLanguageCode(language: string): string {
  return language.trim().toLowerCase().split('-')[0] ?? '';
}
