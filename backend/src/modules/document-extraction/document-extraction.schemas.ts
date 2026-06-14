import { DocumentExtractionType } from '@prisma/client';

/**
 * Central document-type field schemas — the single source of truth for which
 * fields the AI agent is asked to extract and which keys the confirm/apply
 * layer understands.
 *
 * Field KEYS are intentionally aligned with the existing confirm/apply contract
 * (eventDate, odometerKm, workshopName, costCents, treadDepthMm.{fl,fr,rl,rr},
 * serviceKind/scopeCsv for brakes, recordKind/scope/voltageV/sohPercent for
 * battery, severity for damage, etc.) so no incompatible duplicate naming is
 * introduced. Extra descriptive fields (validUntil, reportNumber, vendorName…)
 * are stored on the extraction and surfaced for human review.
 *
 * NOTE: no field-level confidence — this is a deliberate product decision.
 */

export type FieldType = 'string' | 'number' | 'date' | 'enum';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Allowed values for enum fields (advisory, also passed to the agent). */
  enumValues?: string[];
  /** Short hint passed to the agent prompt. */
  hint?: string;
}

const COMMON_EVENT: FieldDef[] = [
  { key: 'eventDate', label: 'Date', type: 'date', hint: 'ISO date YYYY-MM-DD' },
  { key: 'odometerKm', label: 'Odometer (km)', type: 'number' },
  { key: 'workshopName', label: 'Workshop / Vendor', type: 'string' },
];

export const DOCUMENT_FIELD_SCHEMAS: Record<DocumentExtractionType, FieldDef[]> = {
  SERVICE: [
    ...COMMON_EVENT,
    { key: 'description', label: 'Description', type: 'string' },
    { key: 'costCents', label: 'Total cost (cents, gross)', type: 'number' },
    { key: 'invoiceNumber', label: 'Invoice number', type: 'string' },
    { key: 'nextServiceDate', label: 'Next service date', type: 'date' },
    { key: 'nextServiceMileageKm', label: 'Next service mileage (km)', type: 'number' },
  ],
  OIL_CHANGE: [
    ...COMMON_EVENT,
    { key: 'oilType', label: 'Oil type', type: 'string' },
    { key: 'quantityLiters', label: 'Quantity (liters)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'string' },
    { key: 'nextOilChangeDate', label: 'Next oil change date', type: 'date' },
    { key: 'nextOilChangeMileageKm', label: 'Next oil change mileage (km)', type: 'number' },
  ],
  TIRE: [
    ...COMMON_EVENT,
    { key: 'season', label: 'Season', type: 'enum', enumValues: ['summer', 'winter', 'all_season'] },
    { key: 'tireBrand', label: 'Tire brand', type: 'string' },
    { key: 'tireModel', label: 'Tire model', type: 'string' },
    { key: 'tireSize', label: 'Tire size', type: 'string' },
    { key: 'dot', label: 'DOT code', type: 'string' },
    { key: 'action', label: 'Action', type: 'enum', enumValues: ['measure', 'rotate', 'change', 'install'] },
    { key: 'treadDepthMm.fl', label: 'Tread front-left (mm)', type: 'number' },
    { key: 'treadDepthMm.fr', label: 'Tread front-right (mm)', type: 'number' },
    { key: 'treadDepthMm.rl', label: 'Tread rear-left (mm)', type: 'number' },
    { key: 'treadDepthMm.rr', label: 'Tread rear-right (mm)', type: 'number' },
  ],
  BRAKE: [
    ...COMMON_EVENT,
    {
      key: 'serviceKind',
      label: 'Service kind',
      type: 'enum',
      enumValues: ['inspection_only', 'pads_service', 'discs_service', 'brake_fluid_service', 'full_brake_service'],
    },
    { key: 'scopeCsv', label: 'Scope (CSV: front_pads,rear_pads,front_discs,rear_discs)', type: 'string' },
    { key: 'frontPadMm', label: 'Front pad thickness (mm)', type: 'number' },
    { key: 'rearPadMm', label: 'Rear pad thickness (mm)', type: 'number' },
    { key: 'frontDiscMm', label: 'Front disc thickness (mm)', type: 'number' },
    { key: 'rearDiscMm', label: 'Rear disc thickness (mm)', type: 'number' },
    {
      key: 'discCondition',
      label: 'Brake disc condition',
      type: 'enum',
      enumValues: ['good', 'watch', 'warning', 'critical'],
      hint: 'Overall condition of the brake discs/rotors if stated',
    },
    {
      key: 'brakeFluidStatus',
      label: 'Brake fluid status',
      type: 'enum',
      enumValues: ['good', 'watch', 'warning', 'critical'],
      hint: 'Brake fluid condition / water content result if stated',
    },
    {
      key: 'immediateReplacement',
      label: 'Immediate replacement required',
      type: 'enum',
      enumValues: ['yes', 'no'],
      hint: 'Set yes ONLY if the report explicitly demands an immediate brake replacement',
    },
    { key: 'description', label: 'Description', type: 'string' },
    { key: 'costCents', label: 'Total cost (cents, gross)', type: 'number' },
  ],
  BATTERY: [
    ...COMMON_EVENT,
    { key: 'recordKind', label: 'Record kind', type: 'enum', enumValues: ['measurement', 'replacement'] },
    { key: 'scope', label: 'Scope', type: 'enum', enumValues: ['lv', 'hv'] },
    { key: 'batteryType', label: 'Battery type', type: 'string' },
    { key: 'voltageV', label: 'Measured voltage (V)', type: 'number' },
    { key: 'sohPercent', label: 'State of health (%)', type: 'number' },
    { key: 'restingVoltage', label: 'Resting voltage (V)', type: 'number' },
    { key: 'testResult', label: 'Test result', type: 'string' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  TUV_REPORT: [
    { key: 'eventDate', label: 'Inspection date', type: 'date' },
    { key: 'odometerKm', label: 'Mileage (km)', type: 'number' },
    { key: 'workshopName', label: 'Inspector / station', type: 'string' },
    { key: 'result', label: 'Result', type: 'string' },
    { key: 'validUntil', label: 'Valid until', type: 'date' },
    { key: 'defects', label: 'Defects', type: 'string' },
    { key: 'reportNumber', label: 'Report number', type: 'string' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  BOKRAFT_REPORT: [
    { key: 'eventDate', label: 'Inspection date', type: 'date' },
    { key: 'odometerKm', label: 'Mileage (km)', type: 'number' },
    { key: 'workshopName', label: 'Inspector / station', type: 'string' },
    { key: 'result', label: 'Result', type: 'string' },
    { key: 'validUntil', label: 'Valid until', type: 'date' },
    { key: 'defects', label: 'Defects', type: 'string' },
    { key: 'reportNumber', label: 'Report number', type: 'string' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  VEHICLE_CONDITION: [
    { key: 'eventDate', label: 'Report date', type: 'date' },
    { key: 'odometerKm', label: 'Mileage (km)', type: 'number' },
    { key: 'description', label: 'Condition summary', type: 'string' },
  ],
  INVOICE: [
    { key: 'eventDate', label: 'Invoice date', type: 'date' },
    { key: 'invoiceDate', label: 'Invoice date (alt)', type: 'date' },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    { key: 'title', label: 'Title', type: 'string' },
    { key: 'description', label: 'Description', type: 'string' },
    { key: 'vendorName', label: 'Vendor', type: 'string' },
    { key: 'invoiceNumber', label: 'Invoice number', type: 'string' },
    { key: 'totalCents', label: 'Total amount (cents, gross)', type: 'number' },
  ],
  ACCIDENT: [
    { key: 'eventDate', label: 'Incident date', type: 'date' },
    { key: 'odometerKm', label: 'Mileage (km)', type: 'number' },
    { key: 'location', label: 'Location', type: 'string' },
    { key: 'description', label: 'Description', type: 'string' },
    { key: 'policeReport', label: 'Police report reference', type: 'string' },
    { key: 'opponentInvolved', label: 'Opponent involved', type: 'string' },
    { key: 'drivableAfterIncident', label: 'Drivable after incident', type: 'string' },
    { key: 'severity', label: 'Severity', type: 'enum', enumValues: ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] },
    { key: 'estimatedCostGross', label: 'Estimated cost (gross)', type: 'number' },
  ],
  DAMAGE: [
    { key: 'eventDate', label: 'Incident date', type: 'date' },
    { key: 'odometerKm', label: 'Mileage (km)', type: 'number' },
    { key: 'location', label: 'Location', type: 'string' },
    { key: 'damageArea', label: 'Damage area', type: 'string' },
    { key: 'description', label: 'Damage description', type: 'string' },
    { key: 'severity', label: 'Severity', type: 'enum', enumValues: ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] },
    { key: 'estimatedCostGross', label: 'Estimated cost (gross)', type: 'number' },
  ],
  FINE: [
    { key: 'eventDate', label: 'Date', type: 'date' },
    { key: 'description', label: 'Reason', type: 'string' },
    { key: 'totalCents', label: 'Amount (cents)', type: 'number' },
    { key: 'reportNumber', label: 'Reference number', type: 'string' },
  ],
  OTHER: [
    { key: 'eventDate', label: 'Date', type: 'date' },
    { key: 'description', label: 'Description', type: 'string' },
  ],
};

export const SUPPORTED_DOCUMENT_TYPES = Object.keys(
  DOCUMENT_FIELD_SCHEMAS,
) as DocumentExtractionType[];

export function isSupportedDocumentType(value: unknown): value is DocumentExtractionType {
  return typeof value === 'string' && (SUPPORTED_DOCUMENT_TYPES as string[]).includes(value);
}

export function getFieldSchema(documentType: DocumentExtractionType): FieldDef[] {
  return DOCUMENT_FIELD_SCHEMAS[documentType] ?? DOCUMENT_FIELD_SCHEMAS.OTHER;
}

/** Builds an empty extractedData object (flat keys, nested for `treadDepthMm`). */
export function buildEmptyExtractedData(
  documentType: DocumentExtractionType,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of getFieldSchema(documentType)) {
    if (f.key.includes('.')) {
      const [parent, child] = f.key.split('.');
      const obj = (out[parent] as Record<string, unknown>) ?? {};
      obj[child] = null;
      out[parent] = obj;
    } else {
      out[f.key] = null;
    }
  }
  return out;
}

// ── Upload constraints ─────────────────────────────────────────────────────

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'text/plain',
] as const;

export const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.txt',
] as const;

export function isAllowedMimeType(mime: string | undefined): boolean {
  return !!mime && (ALLOWED_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}
