/** Canonical data categories for consent records (validated in DTOs). */
export const DATA_AUTHORIZATION_DATA_CATEGORIES = [
  'GPS_LOCATION',
  'TELEMETRY_DATA',
  'VEHICLE_IDENTITY',
  'VEHICLE_STATUS',
  'ODOMETER',
  'TRIP_DATA',
  'DRIVING_BEHAVIOR',
  'HEALTH_SIGNALS',
  'DTC_CODES',
  'BOOKING_DATA',
  'CUSTOMER_DATA',
  'FINANCIAL_DATA',
  'DOCUMENT_DATA',
] as const;

export type DataAuthorizationDataCategory =
  (typeof DATA_AUTHORIZATION_DATA_CATEGORIES)[number];

/** Legacy UI category keys still accepted on manual create. */
export const LEGACY_DATA_AUTHORIZATION_CATEGORIES = [
  'vehicle_identity',
  'vin_license',
  'insurance_data',
  'telematics_usage',
  'trip_data',
  'maintenance_data',
  'fleet_condition',
  'document_data',
  'booking_data',
  'customer_data',
  'financial_data',
] as const;

export const ALL_DATA_AUTHORIZATION_CATEGORIES = [
  ...DATA_AUTHORIZATION_DATA_CATEGORIES,
  ...LEGACY_DATA_AUTHORIZATION_CATEGORIES,
] as const;

export const DATA_AUTHORIZATION_PURPOSES = [
  'LIVE_MAP',
  'TRIPS',
  'VEHICLE_HEALTH',
  'ALERTS',
  'FLEET_ANALYTICS',
  'RENTAL_ANALYTICS',
  'TECHNICAL_OVERVIEW',
  'ABUSE_MISUSE_DETECTION',
  'DOCUMENT_PROCESSING',
  'CUSTOMER_CONSENT',
  'PARTNER_SERVICE',
] as const;

export type DataAuthorizationPurpose =
  (typeof DATA_AUTHORIZATION_PURPOSES)[number];

export const DATA_AUTHORIZATION_SOURCE_TYPES = [
  'DIMO',
  'SYNQDRIVE_SYSTEM',
  'CUSTOMER_CONSENT',
  'PARTNER_ACCESS',
  'MANUAL_UPLOAD',
  'API_INTEGRATION',
] as const;

export const DATA_AUTHORIZATION_PROCESSOR_TYPES = [
  'SYNQDRIVE',
  'EXTERNAL_PARTNER',
  'INTERNAL_SYSTEM',
] as const;

export const DATA_AUTHORIZATION_SCOPES = [
  'ORGANIZATION',
  'CONNECTED_VEHICLES',
  'VEHICLE',
  'CUSTOMER',
  'BOOKING',
] as const;

export const DATA_AUTHORIZATION_RISK_LEVELS = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;

export const DATA_AUTHORIZATION_ACCESS_PATTERNS = [
  'ONE_TIME',
  'ONGOING',
  'RECURRING',
  'EVENT_DRIVEN',
] as const;

export const DIMO_TELEMETRY_SYSTEM_KEY = 'DIMO_TELEMETRY';

export const DIMO_TELEMETRY_AUTHORIZATION = {
  systemKey: DIMO_TELEMETRY_SYSTEM_KEY,
  title: 'DIMO Telemetry Authorization',
  description:
    'Das Unternehmen autorisiert SynqDrive, DIMO Hardware-/Cloud-Daten der verbundenen Fahrzeuge zu verarbeiten.',
  sourceType: 'DIMO' as const,
  processorType: 'SYNQDRIVE' as const,
  processorName: 'SynqDrive',
  moduleOrigin: 'Telematics',
  scope: 'CONNECTED_VEHICLES' as const,
  riskLevel: 'HIGH' as const,
  destination: 'SynqDrive Platform',
  accessPattern: 'ONGOING' as const,
  dataCategories: [
    'GPS_LOCATION',
    'TELEMETRY_DATA',
    'VEHICLE_IDENTITY',
    'VEHICLE_STATUS',
    'ODOMETER',
    'TRIP_DATA',
    'HEALTH_SIGNALS',
    'DTC_CODES',
  ] as const,
  purposes: [
    'LIVE_MAP',
    'TRIPS',
    'VEHICLE_HEALTH',
    'ALERTS',
    'FLEET_ANALYTICS',
    'RENTAL_ANALYTICS',
    'TECHNICAL_OVERVIEW',
  ] as const,
};

export const DATA_AUTH_MODULE = 'data-authorization';
