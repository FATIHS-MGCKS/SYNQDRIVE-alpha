import type {
  DataAuthorizationProcessorType,
  DataAuthorizationRiskLevel,
} from '@prisma/client';
import { DATA_AUTHORIZATION_DATA_CATEGORIES } from './data-authorization.constants';

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  vehicle_identity: 'VEHICLE_IDENTITY',
  vin_license: 'VEHICLE_IDENTITY',
  insurance_data: 'DOCUMENT_DATA',
  telematics_usage: 'TELEMETRY_DATA',
  trip_data: 'TRIP_DATA',
  maintenance_data: 'HEALTH_SIGNALS',
  fleet_condition: 'VEHICLE_STATUS',
  document_data: 'DOCUMENT_DATA',
  booking_data: 'BOOKING_DATA',
  customer_data: 'CUSTOMER_DATA',
  financial_data: 'FINANCIAL_DATA',
};

const HIGH_RISK_CATEGORIES = new Set([
  'GPS_LOCATION',
  'TRIP_DATA',
  'HEALTH_SIGNALS',
  'DTC_CODES',
  'ODOMETER',
  'TELEMETRY_DATA',
]);

const LOW_ONLY_CATEGORIES = new Set([
  'VEHICLE_IDENTITY',
  'VEHICLE_STATUS',
]);

export function normalizeDataCategories(categories: string[]): string[] {
  return categories.map(
    (c) => LEGACY_CATEGORY_MAP[c] ?? c.toUpperCase(),
  );
}

/**
 * Server-side risk scoring for org data authorizations.
 * Client-supplied riskLevel is ignored on create/grant.
 */
export function calculateAuthorizationRiskLevel(input: {
  dataCategories: string[];
  purposes?: string[];
  processorType?: DataAuthorizationProcessorType | string | null;
  scope?: string;
}): DataAuthorizationRiskLevel {
  const categories = new Set(normalizeDataCategories(input.dataCategories));
  const processor = input.processorType ?? 'SYNQDRIVE';
  const isExternalPartner = processor === 'EXTERNAL_PARTNER';

  const hasCustomer = categories.has('CUSTOMER_DATA');
  const hasGps = categories.has('GPS_LOCATION');
  const hasFinancial = categories.has('FINANCIAL_DATA');
  const hasBooking = categories.has('BOOKING_DATA');

  if (
    (hasCustomer && hasGps) ||
    (hasFinancial && isExternalPartner) ||
    (hasCustomer && hasGps && hasBooking)
  ) {
    return 'CRITICAL';
  }

  for (const cat of categories) {
    if (HIGH_RISK_CATEGORIES.has(cat)) {
      return 'HIGH';
    }
  }

  if (hasFinancial || hasCustomer) {
    return 'HIGH';
  }

  const onlyLow =
    categories.size > 0 &&
    [...categories].every((c) => LOW_ONLY_CATEGORIES.has(c));

  if (onlyLow) {
    return 'LOW';
  }

  if (categories.size > 0) {
    return 'MEDIUM';
  }

  return 'MEDIUM';
}

export function isCanonicalCategory(
  value: string,
): value is (typeof DATA_AUTHORIZATION_DATA_CATEGORIES)[number] {
  return (DATA_AUTHORIZATION_DATA_CATEGORIES as readonly string[]).includes(
    value,
  );
}
