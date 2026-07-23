import { formatLanguageCode } from './legal-document-scope.validation';
import {
  deriveJurisdictionFromLanguageCode,
  LEGAL_CUSTOMER_SEGMENT,
} from './legal-document-scope.constants';
import { LEGAL_BOOKING_CHANNEL } from './legal-document-scope.constants';
import {
  LEGAL_DOCUMENT_RESOLVER_ERROR_CODES,
  LEGAL_DOCUMENT_RESOLVER_FALLBACK_POLICY,
  LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE,
} from './legal-document-resolver.constants';
import type {
  LegalDocumentEvaluatedContext,
  LegalDocumentFallbackDecision,
  LegalDocumentResolverError,
  LegalDocumentResolverInput,
} from './legal-document-resolver.types';

export interface OrganizationContextHints {
  language?: string | null;
  country?: string | null;
  businessType?: string | null;
}

export interface CustomerContextHints {
  customerType?: 'INDIVIDUAL' | 'CORPORATE' | string | null;
  country?: string | null;
}

export interface BookingContextHints {
  id: string;
  pickupStationId?: string | null;
  createdAt?: Date | null;
}

export interface BuildResolverContextInput {
  resolverInput: LegalDocumentResolverInput;
  organization?: OrganizationContextHints | null;
  customer?: CustomerContextHints | null;
  booking?: BookingContextHints | null;
}

export interface BuiltResolverContext {
  context: LegalDocumentEvaluatedContext;
  fallbackDecisions: LegalDocumentFallbackDecision[];
  errors: LegalDocumentResolverError[];
}

function normalizeCountry(value?: string | null): string | null {
  if (!value?.trim()) return null;
  return value.trim().toUpperCase();
}

export function mapCustomerTypeToSegment(
  customerType?: string | null,
): 'B2C' | 'B2B' | null {
  if (customerType === 'CORPORATE') return 'B2B';
  if (customerType === 'INDIVIDUAL') return 'B2C';
  return null;
}

export function buildResolverContext(input: BuildResolverContextInput): BuiltResolverContext {
  const { resolverInput, organization, customer, booking } = input;
  const fallbackDecisions: LegalDocumentFallbackDecision[] = [];
  const errors: LegalDocumentResolverError[] = [];

  const effectiveTimestamp = resolverInput.effectiveTimestamp
    ? new Date(resolverInput.effectiveTimestamp)
    : booking?.createdAt
      ? new Date(booking.createdAt)
      : new Date();

  let customerLanguage: string | null = null;
  if (resolverInput.customerLanguage?.trim()) {
    try {
      customerLanguage = formatLanguageCode(resolverInput.customerLanguage);
      fallbackDecisions.push({
        field: 'customerLanguage',
        source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.EXPLICIT,
        value: customerLanguage,
        message: 'Language provided explicitly in resolver input.',
      });
    } catch {
      errors.push({
        code: LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.UNSUPPORTED_LANGUAGE,
        message: 'customerLanguage is not a supported standardized language code',
        field: 'customerLanguage',
      });
    }
  } else if (
    LEGAL_DOCUMENT_RESOLVER_FALLBACK_POLICY.language.allowOrganizationLanguage &&
    organization?.language?.trim()
  ) {
    try {
      customerLanguage = formatLanguageCode(organization.language);
      fallbackDecisions.push({
        field: 'customerLanguage',
        source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.ORGANIZATION_LANGUAGE,
        value: customerLanguage,
        message: 'Language taken from organization settings (not a silent German default).',
      });
    } catch {
      errors.push({
        code: LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.UNSUPPORTED_LANGUAGE,
        message: 'Organization language is not a supported standardized language code',
        field: 'customerLanguage',
      });
    }
  } else {
    errors.push({
      code: LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.MISSING_LANGUAGE,
      message:
        'customerLanguage is required — SynqDrive does not silently fall back to German',
      field: 'customerLanguage',
    });
  }

  let jurisdiction: string | null = normalizeCountry(resolverInput.jurisdiction);
  if (jurisdiction) {
    fallbackDecisions.push({
      field: 'jurisdiction',
      source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.EXPLICIT,
      value: jurisdiction,
      message: 'Jurisdiction provided explicitly in resolver input.',
    });
  } else if (
    LEGAL_DOCUMENT_RESOLVER_FALLBACK_POLICY.jurisdiction.allowCustomerCountry &&
    customer?.country
  ) {
    jurisdiction = normalizeCountry(customer.country);
    if (jurisdiction) {
      fallbackDecisions.push({
        field: 'jurisdiction',
        source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.CUSTOMER_COUNTRY,
        value: jurisdiction,
        message: 'Jurisdiction derived from customer country.',
      });
    }
  } else if (
    LEGAL_DOCUMENT_RESOLVER_FALLBACK_POLICY.jurisdiction.allowOrganizationCountry &&
    organization?.country
  ) {
    jurisdiction = normalizeCountry(organization.country);
    if (jurisdiction) {
      fallbackDecisions.push({
        field: 'jurisdiction',
        source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.ORGANIZATION_COUNTRY,
        value: jurisdiction,
        message: 'Jurisdiction derived from organization country.',
      });
    }
  } else if (
    LEGAL_DOCUMENT_RESOLVER_FALLBACK_POLICY.jurisdiction.allowDeriveFromLanguage &&
    customerLanguage
  ) {
    jurisdiction = deriveJurisdictionFromLanguageCode(customerLanguage);
    fallbackDecisions.push({
      field: 'jurisdiction',
      source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.DERIVE_FROM_LANGUAGE,
      value: jurisdiction,
      message: 'Jurisdiction derived from resolved language code.',
    });
  }

  let customerSegment: 'B2C' | 'B2B' | null = resolverInput.customerSegment ?? null;
  if (customerSegment) {
    fallbackDecisions.push({
      field: 'customerSegment',
      source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.EXPLICIT,
      value: customerSegment,
      message: 'Customer segment provided explicitly in resolver input.',
    });
  } else {
    const derived = mapCustomerTypeToSegment(customer?.customerType);
    if (derived) {
      customerSegment = derived;
      fallbackDecisions.push({
        field: 'customerSegment',
        source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.CUSTOMER_TYPE,
        value: derived,
        message: 'Customer segment derived from customer type.',
      });
    }
  }

  let bookingChannel = resolverInput.bookingChannel?.trim() || null;
  if (bookingChannel) {
    fallbackDecisions.push({
      field: 'bookingChannel',
      source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.EXPLICIT,
      value: bookingChannel,
      message: 'Booking channel provided explicitly in resolver input.',
    });
  } else {
    bookingChannel = LEGAL_DOCUMENT_RESOLVER_FALLBACK_POLICY.bookingChannel.defaultWhenMissing;
    fallbackDecisions.push({
      field: 'bookingChannel',
      source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.DEFAULT_BOOKING_CHANNEL,
      value: bookingChannel,
      message: 'Booking channel defaulted to configured value (MANUAL).',
    });
  }

  let productScope = resolverInput.productScope?.trim().toUpperCase() || null;
  if (productScope) {
    fallbackDecisions.push({
      field: 'productScope',
      source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.EXPLICIT,
      value: productScope,
      message: 'Product scope provided explicitly in resolver input.',
    });
  } else if (organization?.businessType) {
    productScope = organization.businessType;
    fallbackDecisions.push({
      field: 'productScope',
      source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.ORGANIZATION_BUSINESS_TYPE,
      value: productScope,
      message: 'Product scope derived from organization business type.',
    });
  }

  let stationId = resolverInput.stationId ?? null;
  if (stationId) {
    fallbackDecisions.push({
      field: 'stationId',
      source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.EXPLICIT,
      value: stationId,
      message: 'Station provided explicitly in resolver input.',
    });
  } else if (booking?.pickupStationId) {
    stationId = booking.pickupStationId;
    fallbackDecisions.push({
      field: 'stationId',
      source: LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.BOOKING_PICKUP_STATION,
      value: stationId,
      message: 'Station derived from booking pickup station.',
    });
  }

  const context: LegalDocumentEvaluatedContext = {
    organizationId: resolverInput.organizationId,
    bookingId: resolverInput.bookingId ?? booking?.id ?? null,
    customerLanguage,
    customerSegment,
    jurisdiction,
    bookingChannel,
    productScope,
    stationId,
    effectiveTimestamp: effectiveTimestamp.toISOString(),
  };

  return { context, fallbackDecisions, errors };
}

export function defaultCustomerSegmentWhenMissing(): 'B2C' | 'B2B' {
  return LEGAL_CUSTOMER_SEGMENT.B2C as 'B2C';
}
