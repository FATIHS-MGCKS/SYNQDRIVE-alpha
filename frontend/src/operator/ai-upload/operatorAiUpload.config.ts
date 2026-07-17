import { DOC_TYPE_LABELS, EXTRACTION_TEMPLATES } from '../../rental/components/documents/document-extraction.shared';

export type OperatorAiUploadContextMode =
  | 'general'
  | 'vehicle'
  | 'booking'
  | 'customer'
  | 'damage'
  | 'tire'
  | 'service';

export interface OperatorDocTypeOption {
  key: string;
  label: string;
}

/** Operator-facing labels mapped to existing backend DocumentExtractionType keys only. */
export const OPERATOR_DOC_TYPE_OPTIONS: OperatorDocTypeOption[] = [
  { key: 'VEHICLE_CONDITION', label: 'Fahrzeugschein / Zulassung' },
  { key: 'SERVICE', label: 'Servicebericht' },
  { key: 'OIL_CHANGE', label: 'Ölwechsel-Nachweis' },
  { key: 'TIRE', label: 'Reifenbericht' },
  { key: 'BRAKE', label: 'Bremsen-Nachweis' },
  { key: 'BATTERY', label: 'Batterie-Nachweis' },
  { key: 'TUV_REPORT', label: 'TÜV / HU' },
  { key: 'BOKRAFT_REPORT', label: 'BOKraft' },
  { key: 'DAMAGE', label: 'Schadensbeleg' },
  { key: 'ACCIDENT', label: 'Unfallbericht' },
  { key: 'INVOICE', label: 'Rechnung / Beleg' },
  { key: 'FINE', label: 'Bußgeld' },
  { key: 'OTHER', label: 'Sonstiges' },
].filter((o) => o.key in EXTRACTION_TEMPLATES);

export const CONTEXT_MODE_LABELS: Record<OperatorAiUploadContextMode, string> = {
  general: 'Allgemein',
  vehicle: 'Fahrzeug',
  booking: 'Buchung / Handover',
  customer: 'Kunde (Referenz)',
  damage: 'Schaden',
  tire: 'Reifen',
  service: 'Service / TÜV / BOKraft',
};

export const CONTEXT_DEFAULT_DOC_TYPE: Record<OperatorAiUploadContextMode, string> = {
  general: 'OTHER',
  vehicle: 'VEHICLE_CONDITION',
  booking: 'VEHICLE_CONDITION',
  customer: 'OTHER',
  damage: 'DAMAGE',
  tire: 'TIRE',
  service: 'AUTO',
};

export const DOC_TYPE_TARGET_MODULE: Record<string, string> = {
  SERVICE: 'Service Info',
  OIL_CHANGE: 'Ölwechsel',
  TIRE: 'Reifen / Tire Health Evidence',
  BRAKE: 'Bremsen',
  BATTERY: 'Batterie',
  TUV_REPORT: 'TÜV / HU Compliance',
  BOKRAFT_REPORT: 'BOKraft Compliance',
  VEHICLE_CONDITION: 'Fahrzeugakte / Zulassung',
  INVOICE: 'Rechnungen / Belege',
  DAMAGE: 'Schäden / Evidence',
  ACCIDENT: 'Schäden / Unfall',
  FINE: 'Bußgelder',
  OTHER: 'Fahrzeugakte (Sonstiges)',
};

/** Fields that need extra operator attention before confirm. */
export const CRITICAL_REVIEW_FIELD_KEYS = new Set([
  'odometerKm',
  'treadDepthMm.fl',
  'treadDepthMm.fr',
  'treadDepthMm.rl',
  'treadDepthMm.rr',
  'eventDate',
  'validUntil',
  'nextServiceDate',
  'nextServiceMileageKm',
  'nextOilChangeDate',
  'severity',
  'sohPercent',
]);

export function docTypeLabel(key: string): string {
  return OPERATOR_DOC_TYPE_OPTIONS.find((o) => o.key === key)?.label ?? DOC_TYPE_LABELS[key] ?? key;
}

export function isCriticalReviewField(key: string): boolean {
  return CRITICAL_REVIEW_FIELD_KEYS.has(key);
}

export const OPERATOR_UPLOAD_SOURCE = 'operator_app';
