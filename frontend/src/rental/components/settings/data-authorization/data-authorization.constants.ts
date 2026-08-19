import type { DataAuthorizationDto } from '../../../../lib/api';
import type { TranslationKey } from '../../../../i18n/translations/en';
import { st } from '../../tasks-settings/settings-i18n';

export const DIMO_TELEMETRY_SYSTEM_KEY = 'DIMO_TELEMETRY';

function optionValues<T extends string>(
  locale: string,
  allKey: TranslationKey,
  entries: Array<{ value: T; key: TranslationKey }>,
): Array<{ value: T | 'all'; label: string }> {
  return [
    { value: 'all', label: st(locale, allKey) },
    ...entries.map(({ value, key }) => ({ value, label: st(locale, key) })),
  ];
}

export function getSourceTypeOptions(locale: string) {
  return optionValues(locale, 'settings.dataAuth.filter.allSources', [
    { value: 'DIMO', key: 'settings.dataAuth.source.DIMO' },
    { value: 'SYNQDRIVE_SYSTEM', key: 'settings.dataAuth.source.SYNQDRIVE_SYSTEM' },
    { value: 'CUSTOMER_CONSENT', key: 'settings.dataAuth.source.CUSTOMER_CONSENT' },
    { value: 'PARTNER_ACCESS', key: 'settings.dataAuth.source.PARTNER_ACCESS' },
    { value: 'MANUAL_UPLOAD', key: 'settings.dataAuth.source.MANUAL_UPLOAD' },
    { value: 'API_INTEGRATION', key: 'settings.dataAuth.source.API_INTEGRATION' },
  ]);
}

export function getScopeOptions(locale: string) {
  return optionValues(locale, 'settings.dataAuth.filter.allScopes', [
    { value: 'ORGANIZATION', key: 'settings.dataAuth.scope.ORGANIZATION' },
    { value: 'CONNECTED_VEHICLES', key: 'settings.dataAuth.scope.CONNECTED_VEHICLES' },
    { value: 'VEHICLE', key: 'settings.dataAuth.scope.VEHICLE' },
    { value: 'CUSTOMER', key: 'settings.dataAuth.scope.CUSTOMER' },
    { value: 'BOOKING', key: 'settings.dataAuth.scope.BOOKING' },
  ]);
}

export function getStatusOptions(locale: string) {
  return optionValues(locale, 'settings.dataAuth.filter.allStatuses', [
    { value: 'ACTIVE', key: 'settings.dataAuth.status.ACTIVE' },
    { value: 'PENDING', key: 'settings.dataAuth.status.PENDING' },
    { value: 'REVOKED', key: 'settings.dataAuth.status.REVOKED' },
    { value: 'EXPIRED', key: 'settings.dataAuth.status.EXPIRED' },
  ]);
}

export function getRiskOptions(locale: string) {
  return optionValues(locale, 'settings.dataAuth.filter.allRisks', [
    { value: 'LOW', key: 'settings.dataAuth.risk.LOW' },
    { value: 'MEDIUM', key: 'settings.dataAuth.risk.MEDIUM' },
    { value: 'HIGH', key: 'settings.dataAuth.risk.HIGH' },
    { value: 'CRITICAL', key: 'settings.dataAuth.risk.CRITICAL' },
  ]);
}

const PURPOSE_KEYS: Record<string, TranslationKey> = {
  LIVE_MAP: 'settings.dataAuth.purpose.LIVE_MAP',
  TRIPS: 'settings.dataAuth.purpose.TRIPS',
  VEHICLE_HEALTH: 'settings.dataAuth.purpose.VEHICLE_HEALTH',
  ALERTS: 'settings.dataAuth.purpose.ALERTS',
  FLEET_ANALYTICS: 'settings.dataAuth.purpose.FLEET_ANALYTICS',
  RENTAL_ANALYTICS: 'settings.dataAuth.purpose.RENTAL_ANALYTICS',
  TECHNICAL_OVERVIEW: 'settings.dataAuth.purpose.TECHNICAL_OVERVIEW',
  ABUSE_MISUSE_DETECTION: 'settings.dataAuth.purpose.ABUSE_MISUSE_DETECTION',
  DOCUMENT_PROCESSING: 'settings.dataAuth.purpose.DOCUMENT_PROCESSING',
  CUSTOMER_CONSENT: 'settings.dataAuth.purpose.CUSTOMER_CONSENT',
  PARTNER_SERVICE: 'settings.dataAuth.purpose.PARTNER_SERVICE',
};

export function getPurposeOptions(locale: string) {
  return Object.entries(PURPOSE_KEYS).map(([value, key]) => ({
    value,
    label: st(locale, key),
  }));
}

const DATA_CATEGORY_KEYS: Record<string, TranslationKey> = {
  GPS_LOCATION: 'settings.dataAuth.category.GPS_LOCATION',
  TELEMETRY_DATA: 'settings.dataAuth.category.TELEMETRY_DATA',
  VEHICLE_IDENTITY: 'settings.dataAuth.category.VEHICLE_IDENTITY',
  VEHICLE_STATUS: 'settings.dataAuth.category.VEHICLE_STATUS',
  ODOMETER: 'settings.dataAuth.category.ODOMETER',
  TRIP_DATA: 'settings.dataAuth.category.TRIP_DATA',
  DRIVING_BEHAVIOR: 'settings.dataAuth.category.DRIVING_BEHAVIOR',
  HEALTH_SIGNALS: 'settings.dataAuth.category.HEALTH_SIGNALS',
  DTC_CODES: 'settings.dataAuth.category.DTC_CODES',
  BOOKING_DATA: 'settings.dataAuth.category.BOOKING_DATA',
  CUSTOMER_DATA: 'settings.dataAuth.category.CUSTOMER_DATA',
  FINANCIAL_DATA: 'settings.dataAuth.category.FINANCIAL_DATA',
  DOCUMENT_DATA: 'settings.dataAuth.category.DOCUMENT_DATA',
};

const LEGACY_CATEGORY_KEYS: Record<string, TranslationKey> = {
  vehicle_identity: 'settings.dataAuth.category.VEHICLE_IDENTITY',
  vin_license: 'settings.dataAuth.category.VEHICLE_IDENTITY',
  insurance_data: 'settings.dataAuth.category.FINANCIAL_DATA',
  telematics_usage: 'settings.dataAuth.category.TELEMETRY_DATA',
  trip_data: 'settings.dataAuth.category.TRIP_DATA',
  maintenance_data: 'settings.dataAuth.category.HEALTH_SIGNALS',
  fleet_condition: 'settings.dataAuth.category.VEHICLE_STATUS',
  document_data: 'settings.dataAuth.category.DOCUMENT_DATA',
  booking_data: 'settings.dataAuth.category.BOOKING_DATA',
  customer_data: 'settings.dataAuth.category.CUSTOMER_DATA',
  financial_data: 'settings.dataAuth.category.FINANCIAL_DATA',
};

export function getDataCategoryOptions(locale: string) {
  return Object.entries(DATA_CATEGORY_KEYS).map(([value, key]) => ({
    value,
    label: st(locale, key),
  }));
}

export function labelDataCategory(locale: string, key: string): string {
  const upper = key.toUpperCase();
  const canonical = DATA_CATEGORY_KEYS[upper];
  if (canonical) return st(locale, canonical);
  const legacy = LEGACY_CATEGORY_KEYS[key];
  if (legacy) return st(locale, legacy);
  return key.replace(/_/g, ' ');
}

export function labelPurpose(locale: string, key: string): string {
  const found = PURPOSE_KEYS[key];
  return found ? st(locale, found) : key.replace(/_/g, ' ');
}

export function labelSourceType(locale: string, key: string | null | undefined): string {
  if (!key) return '—';
  const found = getSourceTypeOptions(locale).find((o) => o.value === key);
  return found?.label ?? key;
}

export function labelScope(locale: string, key: string): string {
  const found = getScopeOptions(locale).find((o) => o.value === key);
  return found?.label ?? key;
}

export function labelStatus(locale: string, key: string): string {
  const found = getStatusOptions(locale).find((o) => o.value === key);
  return found?.label ?? key;
}

export function labelRisk(locale: string, key: string): string {
  const found = getRiskOptions(locale).find((o) => o.value === key);
  return found?.label ?? key;
}

export function labelProcessor(auth: DataAuthorizationDto): string {
  return auth.processorName ?? auth.destination ?? '—';
}

export function isDimoTelemetryAuth(auth: DataAuthorizationDto): boolean {
  return auth.systemKey === DIMO_TELEMETRY_SYSTEM_KEY;
}

export function getDimoRevokeImpact(locale: string): string {
  return st(locale, 'settings.dataAuth.revoke.dimoImpactLong');
}
