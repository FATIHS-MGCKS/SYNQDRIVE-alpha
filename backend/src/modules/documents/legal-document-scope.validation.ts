import {
  LEGAL_SCOPE_PRIORITY_MAX,
  LEGAL_SCOPE_PRIORITY_MIN,
  deriveJurisdictionFromLanguageCode,
  isLegalBookingChannel,
  isLegalCustomerSegment,
  isLegalNoticePurpose,
  isLegalProductScope,
  isLegalStationScopeMode,
} from './legal-document-scope.constants';

/** BCP-47 subset: ISO 639-1 primary subtag, optional region (e.g. de, de-DE). */
const LANGUAGE_CODE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

/** ISO 3166-1 alpha-2 country codes. */
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export interface LegalScopeValidationResult {
  language: string;
  jurisdictionCountry: string;
  customerSegment: string;
  bookingChannel: string;
  productScope: string | null;
  stationScopeMode: string;
  priority: number;
  isMandatory: boolean;
  noticePurpose: string;
  stationIds: string[];
}

export class LegalScopeValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'LegalScopeValidationError';
  }
}

export function formatLanguageCode(language: string): string {
  const trimmed = language.trim();
  const parts = trimmed.split('-');
  const primary = (parts[0] ?? '').toLowerCase();
  const region = parts[1] ? parts[1].toUpperCase() : null;
  return region ? `${primary}-${region}` : primary;
}

export function validateLanguageCode(language: string, allowDefault = true): string {
  const trimmed = language.trim();
  if (!trimmed) {
    if (allowDefault) return 'de';
    throw new LegalScopeValidationError(
      'language must be a standardized ISO 639-1 code (optional region, e.g. de or de-DE)',
      'language',
    );
  }
  const normalized = formatLanguageCode(trimmed);
  if (!LANGUAGE_CODE_PATTERN.test(normalized)) {
    throw new LegalScopeValidationError(
      'language must be a standardized ISO 639-1 code (optional region, e.g. de or de-DE)',
      'language',
    );
  }
  return normalized;
}

export function validateJurisdictionCountry(
  country: string,
  language?: string,
): string {
  const trimmed = country.trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(trimmed)) {
    throw new LegalScopeValidationError(
      'jurisdictionCountry must be an ISO 3166-1 alpha-2 code (e.g. DE, AT, CH)',
      'jurisdictionCountry',
    );
  }
  if (language) {
    void deriveJurisdictionFromLanguageCode(language);
  }
  return trimmed;
}

export function validatePriority(priority: number): number {
  if (!Number.isInteger(priority)) {
    throw new LegalScopeValidationError('priority must be an integer', 'priority');
  }
  if (priority < LEGAL_SCOPE_PRIORITY_MIN || priority > LEGAL_SCOPE_PRIORITY_MAX) {
    throw new LegalScopeValidationError(
      `priority must be between ${LEGAL_SCOPE_PRIORITY_MIN} and ${LEGAL_SCOPE_PRIORITY_MAX}`,
      'priority',
    );
  }
  return priority;
}

export function validateStationIds(
  stationScopeMode: string,
  stationIds: string[] | undefined,
): string[] {
  const ids = [...new Set((stationIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (stationScopeMode === 'STATION_SPECIFIC' && ids.length === 0) {
    throw new LegalScopeValidationError(
      'stationIds is required when stationScopeMode is STATION_SPECIFIC',
      'stationIds',
    );
  }
  if (stationScopeMode === 'ORGANIZATION_WIDE' && ids.length > 0) {
    throw new LegalScopeValidationError(
      'stationIds must be empty when stationScopeMode is ORGANIZATION_WIDE',
      'stationIds',
    );
  }
  return ids;
}

export interface RawLegalScopeInput {
  language?: string | null;
  jurisdictionCountry?: string | null;
  customerSegment?: string | null;
  bookingChannel?: string | null;
  productScope?: string | null;
  stationScopeMode?: string | null;
  stationIds?: string[] | null;
  priority?: number | null;
  isMandatory?: boolean | null;
  noticePurpose?: string | null;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
}

export function validateLegalScopeInput(
  input: RawLegalScopeInput,
): LegalScopeValidationResult {
  const language = validateLanguageCode(input.language ?? 'de');
  const jurisdictionCountry = validateJurisdictionCountry(
    input.jurisdictionCountry ?? deriveJurisdictionFromLanguageCode(language),
    language,
  );

  const customerSegment = (input.customerSegment ?? 'BOTH').trim();
  if (!isLegalCustomerSegment(customerSegment)) {
    throw new LegalScopeValidationError(
      'customerSegment must be B2C, B2B, or BOTH',
      'customerSegment',
    );
  }

  const bookingChannel = (input.bookingChannel ?? 'ALL').trim();
  if (!isLegalBookingChannel(bookingChannel)) {
    throw new LegalScopeValidationError(
      'bookingChannel must be MANUAL, WEBSITE, API, OPERATOR_APP, or ALL',
      'bookingChannel',
    );
  }

  const stationScopeMode = (input.stationScopeMode ?? 'ORGANIZATION_WIDE').trim();
  if (!isLegalStationScopeMode(stationScopeMode)) {
    throw new LegalScopeValidationError(
      'stationScopeMode must be ORGANIZATION_WIDE or STATION_SPECIFIC',
      'stationScopeMode',
    );
  }

  let productScope: string | null = null;
  if (input.productScope != null && String(input.productScope).trim() !== '') {
    const ps = String(input.productScope).trim().toUpperCase();
    if (!isLegalProductScope(ps)) {
      throw new LegalScopeValidationError(
        'productScope must be RENTAL, FLEET, TAXI, LOGISTICS, OTHER, or null for all',
        'productScope',
      );
    }
    productScope = ps;
  }

  const priority = validatePriority(input.priority ?? 0);
  const isMandatory = input.isMandatory ?? true;

  const noticePurpose = (input.noticePurpose ?? 'GENERAL_NOTICE').trim();
  if (!isLegalNoticePurpose(noticePurpose)) {
    throw new LegalScopeValidationError(
      'noticePurpose is not a recognized legal notice purpose',
      'noticePurpose',
    );
  }

  const stationIds = validateStationIds(stationScopeMode, input.stationIds ?? undefined);

  if (input.validFrom != null && input.validUntil != null) {
    const from = input.validFrom instanceof Date ? input.validFrom : new Date(input.validFrom);
    const until = input.validUntil instanceof Date ? input.validUntil : new Date(input.validUntil);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(until.getTime()) && from >= until) {
      throw new LegalScopeValidationError('validFrom must be before validUntil', 'validFrom');
    }
  }

  return {
    language,
    jurisdictionCountry,
    customerSegment,
    bookingChannel,
    productScope,
    stationScopeMode,
    priority,
    isMandatory,
    noticePurpose,
    stationIds,
  };
}
