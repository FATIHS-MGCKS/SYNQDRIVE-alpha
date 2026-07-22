import { CONSUMER_INFORMATION_VARIANT_LABELS_DE, LEGAL_DOCUMENT_TYPE_CONFIGS } from './legal-document-types';

export const LEGAL_UPLOAD_WIZARD_STEPS = [
  { id: 1, key: 'classification', label: 'Einordnung' },
  { id: 2, key: 'version', label: 'Version & Gültigkeit' },
  { id: 3, key: 'file', label: 'Datei' },
  { id: 4, key: 'review', label: 'Prüfung' },
] as const;

export const LEGAL_UPLOAD_LANGUAGES = [
  { value: 'de', label: 'Deutsch (de)' },
  { value: 'en', label: 'Englisch (en)' },
  { value: 'fr', label: 'Französisch (fr)' },
] as const;

export const LEGAL_UPLOAD_JURISDICTIONS = [
  { value: 'DE', label: 'Deutschland (DE)' },
  { value: 'AT', label: 'Österreich (AT)' },
  { value: 'CH', label: 'Schweiz (CH)' },
] as const;

export const LEGAL_UPLOAD_CUSTOMER_SEGMENTS = [
  { value: 'BOTH', label: 'B2B & B2C' },
  { value: 'B2C', label: 'B2C — Privatkunden' },
  { value: 'B2B', label: 'B2B — Geschäftskunden' },
] as const;

export const LEGAL_UPLOAD_BOOKING_CHANNELS = [
  { value: 'ALL', label: 'Alle Kanäle' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'OPERATOR_APP', label: 'Operator-App' },
  { value: 'MANUAL', label: 'Manuelle Buchung' },
  { value: 'API', label: 'API' },
] as const;

export const LEGAL_UPLOAD_STATION_SCOPE_MODES = [
  { value: 'ORGANIZATION_WIDE', label: 'Organisationsweit' },
  { value: 'STATION_SPECIFIC', label: 'Stationsspezifisch' },
] as const;

export const LEGAL_UPLOAD_PRODUCT_SCOPES = [
  { value: '', label: 'Alle Geschäftsbereiche' },
  { value: 'RENTAL', label: 'Vermietung' },
  { value: 'FLEET', label: 'Flotte' },
  { value: 'TAXI', label: 'Taxi' },
  { value: 'LOGISTICS', label: 'Logistik' },
  { value: 'OTHER', label: 'Sonstige' },
] as const;

export const LEGAL_DOCUMENT_TYPE_OPTIONS = LEGAL_DOCUMENT_TYPE_CONFIGS.map((c) => ({
  value: c.key,
  label: c.title,
}));

export const LEGAL_CONSUMER_VARIANT_OPTIONS = Object.entries(CONSUMER_INFORMATION_VARIANT_LABELS_DE).map(
  ([value, label]) => ({ value, label }),
);

export const LEGAL_UPLOAD_MAX_MB = Math.max(
  1,
  parseInt(import.meta.env.VITE_DOCUMENT_LEGAL_UPLOAD_MAX_MB || '15', 10),
);
