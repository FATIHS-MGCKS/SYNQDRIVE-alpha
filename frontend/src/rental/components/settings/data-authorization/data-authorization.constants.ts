import type { DataAuthorizationDto } from '../../../../lib/api';

export const DIMO_TELEMETRY_SYSTEM_KEY = 'DIMO_TELEMETRY';

export const SOURCE_TYPE_OPTIONS = [
  { value: 'all', label: 'Alle Quellen' },
  { value: 'DIMO', label: 'DIMO' },
  { value: 'SYNQDRIVE_SYSTEM', label: 'SynqDrive System' },
  { value: 'CUSTOMER_CONSENT', label: 'Kundeneinwilligung' },
  { value: 'PARTNER_ACCESS', label: 'Partnerzugriff' },
  { value: 'MANUAL_UPLOAD', label: 'Manueller Upload' },
  { value: 'API_INTEGRATION', label: 'API-Integration' },
] as const;

export const SCOPE_OPTIONS = [
  { value: 'all', label: 'Alle Bereiche' },
  { value: 'ORGANIZATION', label: 'Organisation' },
  { value: 'CONNECTED_VEHICLES', label: 'Verbundene Fahrzeuge' },
  { value: 'VEHICLE', label: 'Fahrzeug' },
  { value: 'CUSTOMER', label: 'Kunde' },
  { value: 'BOOKING', label: 'Buchung' },
] as const;

export const STATUS_OPTIONS = [
  { value: 'all', label: 'Alle Status' },
  { value: 'ACTIVE', label: 'Aktiv' },
  { value: 'PENDING', label: 'Ausstehend' },
  { value: 'REVOKED', label: 'Widerrufen' },
  { value: 'EXPIRED', label: 'Abgelaufen' },
] as const;

export const RISK_OPTIONS = [
  { value: 'all', label: 'Alle Risikostufen' },
  { value: 'LOW', label: 'Niedrig' },
  { value: 'MEDIUM', label: 'Mittel' },
  { value: 'HIGH', label: 'Hoch' },
  { value: 'CRITICAL', label: 'Kritisch' },
] as const;

export const PURPOSE_OPTIONS = [
  { value: 'LIVE_MAP', label: 'Live Map' },
  { value: 'TRIPS', label: 'Trips' },
  { value: 'VEHICLE_HEALTH', label: 'Vehicle Health' },
  { value: 'ALERTS', label: 'Alerts' },
  { value: 'FLEET_ANALYTICS', label: 'Fleet Analytics' },
  { value: 'RENTAL_ANALYTICS', label: 'Rental Analytics' },
  { value: 'TECHNICAL_OVERVIEW', label: 'Technical Overview' },
  { value: 'ABUSE_MISUSE_DETECTION', label: 'Abuse / Misuse Detection' },
  { value: 'DOCUMENT_PROCESSING', label: 'Document Processing' },
  { value: 'CUSTOMER_CONSENT', label: 'Customer Consent' },
  { value: 'PARTNER_SERVICE', label: 'Partner Service' },
] as const;

export const DATA_CATEGORY_OPTIONS = [
  { value: 'GPS_LOCATION', label: 'GPS / Standortdaten' },
  { value: 'TELEMETRY_DATA', label: 'Telemetriedaten' },
  { value: 'VEHICLE_IDENTITY', label: 'Fahrzeugidentität' },
  { value: 'VEHICLE_STATUS', label: 'Fahrzeugstatus' },
  { value: 'ODOMETER', label: 'Kilometerstand' },
  { value: 'TRIP_DATA', label: 'Fahrtdaten / Trips' },
  { value: 'DRIVING_BEHAVIOR', label: 'Fahrverhalten' },
  { value: 'HEALTH_SIGNALS', label: 'Health-Signale' },
  { value: 'DTC_CODES', label: 'Fehlercodes / DTC' },
  { value: 'BOOKING_DATA', label: 'Buchungsdaten' },
  { value: 'CUSTOMER_DATA', label: 'Kundendaten' },
  { value: 'FINANCIAL_DATA', label: 'Finanzdaten' },
  { value: 'DOCUMENT_DATA', label: 'Dokumentendaten' },
] as const;

const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  vehicle_identity: 'Fahrzeugidentität',
  vin_license: 'VIN / Kennzeichen',
  insurance_data: 'Versicherungsdaten',
  telematics_usage: 'Telematik-Nutzungsdaten',
  trip_data: 'Fahrtdaten',
  maintenance_data: 'Wartungsdaten',
  fleet_condition: 'Fahrzeugzustand',
  document_data: 'Dokumentendaten',
  booking_data: 'Buchungsdaten',
  customer_data: 'Kundendaten',
  financial_data: 'Finanzdaten',
};

export function labelDataCategory(key: string): string {
  const upper = key.toUpperCase();
  const canonical = DATA_CATEGORY_OPTIONS.find((o) => o.value === upper);
  if (canonical) return canonical.label;
  return LEGACY_CATEGORY_LABELS[key] ?? key.replace(/_/g, ' ');
}

export function labelPurpose(key: string): string {
  const found = PURPOSE_OPTIONS.find((o) => o.value === key);
  return found?.label ?? key.replace(/_/g, ' ');
}

export function labelSourceType(key: string | null | undefined): string {
  if (!key) return '—';
  const found = SOURCE_TYPE_OPTIONS.find((o) => o.value === key);
  return found?.label ?? key;
}

export function labelScope(key: string): string {
  const found = SCOPE_OPTIONS.find((o) => o.value === key);
  return found?.label ?? key;
}

export function labelStatus(key: string): string {
  const found = STATUS_OPTIONS.find((o) => o.value === key);
  return found?.label ?? key;
}

export function labelRisk(key: string): string {
  const found = RISK_OPTIONS.find((o) => o.value === key);
  return found?.label ?? key;
}

export function labelProcessor(auth: DataAuthorizationDto): string {
  return auth.processorName ?? auth.destination ?? '—';
}

export function isDimoTelemetryAuth(auth: DataAuthorizationDto): boolean {
  return auth.systemKey === DIMO_TELEMETRY_SYSTEM_KEY;
}

export const DIMO_REVOKE_IMPACT =
  'Wenn diese Autorisierung widerrufen wird, werden Live Map, Trips, Health, Alerts, Abuse/Misuse-Auswertungen und technische Telemetrie-Auswertungen für betroffene Fahrzeuge eingeschränkt oder deaktiviert.';
