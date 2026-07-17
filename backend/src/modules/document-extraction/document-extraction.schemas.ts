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

/** Business document types that can be extracted and applied — excludes AUTO. */
export type ApplyDocumentExtractionType = Exclude<DocumentExtractionType, 'AUTO'>;

/** Request-only classification sentinel — never passed to apply services. */
export const AUTO_CLASSIFICATION_REQUEST = 'AUTO' as const;

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

export const DOCUMENT_FIELD_SCHEMAS: Record<ApplyDocumentExtractionType, FieldDef[]> = {
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
    { key: 'inspectionDate', label: 'Inspection date', type: 'date', hint: 'ISO date YYYY-MM-DD' },
    { key: 'eventDate', label: 'Inspection date (alt)', type: 'date' },
    { key: 'validUntil', label: 'Valid until', type: 'date', hint: 'Required for vehicle compliance date update' },
    { key: 'result', label: 'Result', type: 'string', hint: 'e.g. ohne Mängel / mit Mängeln' },
    {
      key: 'defectLevel',
      label: 'Defect level',
      type: 'enum',
      enumValues: ['NONE', 'MINOR', 'MAJOR', 'CRITICAL'],
    },
    { key: 'defects', label: 'Defects', type: 'string' },
    {
      key: 'reinspectionRequired',
      label: 'Reinspection required',
      type: 'string',
      hint: 'true when follow-up inspection is required',
    },
    { key: 'reinspectionDeadline', label: 'Reinspection deadline', type: 'date' },
    { key: 'issuingOrganization', label: 'Issuing organization / station', type: 'string' },
    { key: 'workshopName', label: 'Inspector / station (alias)', type: 'string' },
    { key: 'reportNumber', label: 'Report number', type: 'string' },
    { key: 'mileage', label: 'Mileage (km)', type: 'number' },
    { key: 'odometerKm', label: 'Mileage (km, alias)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  BOKRAFT_REPORT: [
    { key: 'inspectionDate', label: 'Inspection date', type: 'date', hint: 'ISO date YYYY-MM-DD' },
    { key: 'eventDate', label: 'Inspection date (alt)', type: 'date' },
    { key: 'validUntil', label: 'Valid until', type: 'date', hint: 'Required for vehicle compliance date update' },
    { key: 'result', label: 'Result', type: 'string' },
    {
      key: 'defectLevel',
      label: 'Defect level',
      type: 'enum',
      enumValues: ['NONE', 'MINOR', 'MAJOR', 'CRITICAL'],
    },
    { key: 'defects', label: 'Defects', type: 'string' },
    {
      key: 'reinspectionRequired',
      label: 'Reinspection required',
      type: 'string',
    },
    { key: 'reinspectionDeadline', label: 'Reinspection deadline', type: 'date' },
    { key: 'issuingOrganization', label: 'Issuing organization / station', type: 'string' },
    { key: 'workshopName', label: 'Inspector / station (alias)', type: 'string' },
    { key: 'reportNumber', label: 'Report number', type: 'string' },
    { key: 'mileage', label: 'Mileage (km)', type: 'number' },
    { key: 'odometerKm', label: 'Mileage (km, alias)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  VEHICLE_CONDITION: [
    { key: 'eventDate', label: 'Report date', type: 'date' },
    { key: 'odometerKm', label: 'Mileage (km)', type: 'number' },
    { key: 'description', label: 'Condition summary', type: 'string' },
  ],
  INVOICE: [
    { key: 'invoiceNumber', label: 'Invoice number', type: 'string' },
    { key: 'invoiceDate', label: 'Invoice date', type: 'date', hint: 'ISO date YYYY-MM-DD' },
    { key: 'eventDate', label: 'Invoice date (alt)', type: 'date' },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    {
      key: 'currency',
      label: 'Currency',
      type: 'string',
      hint: 'ISO 4217 code (e.g. EUR, USD) — required before apply; never silently converted',
    },
    { key: 'supplier', label: 'Supplier / vendor', type: 'string' },
    { key: 'vendorName', label: 'Vendor (alias)', type: 'string' },
    { key: 'customer', label: 'Customer / addressee', type: 'string' },
    { key: 'subtotalNet', label: 'Subtotal net (cents)', type: 'number' },
    { key: 'totalTax', label: 'Total tax (cents)', type: 'number' },
    { key: 'totalGross', label: 'Total gross (cents)', type: 'number' },
    { key: 'netCents', label: 'Net amount (cents, alias)', type: 'number' },
    { key: 'taxCents', label: 'Tax amount (cents, alias)', type: 'number' },
    { key: 'grossCents', label: 'Gross amount (cents, alias)', type: 'number' },
    { key: 'totalCents', label: 'Total amount (cents, gross alias)', type: 'number' },
    {
      key: 'taxRatePercent',
      label: 'Tax rate (%)',
      type: 'number',
      hint: 'Single-rate invoices only — use taxLines or lineItems for multiple rates',
    },
    {
      key: 'taxLines',
      label: 'Tax groups',
      type: 'string',
      hint: 'JSON array: [{ taxRatePercent, netCents, taxCents, grossCents }]',
    },
    {
      key: 'lineItems',
      label: 'Line items',
      type: 'string',
      hint: 'JSON array: [{ description, quantity, unitPriceNetCents, taxRate, netCents, taxCents, grossCents }]',
    },
    {
      key: 'taxExemptReason',
      label: 'Tax exempt reason',
      type: 'string',
      hint: 'Legal basis when tax-free (e.g. §4 UStG, reverse charge)',
    },
    {
      key: 'reverseCharge',
      label: 'Reverse charge',
      type: 'string',
      hint: 'true when §13b UStG reverse charge applies',
    },
    {
      key: 'amountSemantics',
      label: 'Amount semantics',
      type: 'enum',
      enumValues: ['EXPLICIT', 'GROSS', 'NET', 'UNCLEAR'],
    },
    {
      key: 'taxSemantics',
      label: 'Tax semantics',
      type: 'enum',
      enumValues: ['EXPLICIT', 'TAX_FREE', 'UNCLEAR'],
    },
    {
      key: 'creditNoteReference',
      label: 'Credit note reference',
      type: 'string',
      hint: 'Referenced invoice for credit notes',
    },
    {
      key: 'originalInvoiceReference',
      label: 'Original invoice reference',
      type: 'string',
      hint: 'Original invoice number for credit notes / corrections',
    },
    { key: 'isCreditNote', label: 'Is credit note', type: 'string' },
    { key: 'title', label: 'Title', type: 'string' },
    { key: 'description', label: 'Description', type: 'string' },
  ],
  ACCIDENT: [
    { key: 'eventDateTime', label: 'Incident date/time', type: 'date', hint: 'ISO datetime when available' },
    { key: 'eventDate', label: 'Incident date', type: 'date' },
    { key: 'odometerKm', label: 'Mileage (km)', type: 'number' },
    { key: 'location', label: 'Location', type: 'string' },
    { key: 'damageDescription', label: 'Damage description', type: 'string' },
    { key: 'description', label: 'Description (alias)', type: 'string' },
    {
      key: 'damageAreas',
      label: 'Damage areas',
      type: 'string',
      hint: 'JSON array or comma-separated traceable area tokens',
    },
    { key: 'damageArea', label: 'Primary damage area', type: 'string' },
    {
      key: 'damageType',
      label: 'Damage type',
      type: 'enum',
      enumValues: [
        'SCRATCH',
        'DENT',
        'CRACK',
        'BROKEN_PART',
        'PAINT_DAMAGE',
        'GLASS_DAMAGE',
        'TIRE_DAMAGE',
        'INTERIOR_DAMAGE',
        'OTHER',
        'UNKNOWN',
      ],
      hint: 'Use UNKNOWN when not stated — no SCRATCH default',
    },
    {
      key: 'severity',
      label: 'Severity',
      type: 'enum',
      enumValues: ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL', 'UNKNOWN'],
      hint: 'Use UNKNOWN when not stated — no MODERATE default',
    },
    { key: 'drivable', label: 'Drivable after incident', type: 'string' },
    { key: 'drivableAfterIncident', label: 'Drivable after incident (alias)', type: 'string' },
    { key: 'thirdPartyInvolved', label: 'Third party involved', type: 'string' },
    { key: 'opponentInvolved', label: 'Opponent involved (alias)', type: 'string' },
    { key: 'policeReference', label: 'Police reference', type: 'string' },
    { key: 'policeReport', label: 'Police report (alias)', type: 'string' },
    { key: 'insuranceReference', label: 'Insurance reference', type: 'string' },
    { key: 'insuranceClaimNumber', label: 'Insurance claim number (alias)', type: 'string' },
    { key: 'bookingContext', label: 'Booking context', type: 'string' },
    { key: 'bookingReference', label: 'Booking reference (alias)', type: 'string' },
    { key: 'estimatedCostGross', label: 'Estimated cost (cents, gross)', type: 'number' },
    { key: 'estimatedCostCents', label: 'Estimated cost (cents, alias)', type: 'number' },
    {
      key: 'accidentApplyConfirmed',
      label: 'Accident apply confirmed',
      type: 'string',
      hint: 'true only after explicit human confirmation for final apply',
    },
    {
      key: 'documentKind',
      label: 'Document kind',
      type: 'string',
      hint: 'GUTACHTEN/APPRAISAL links to existing damage instead of creating duplicate',
    },
    { key: 'linkedDamageId', label: 'Linked damage id', type: 'string' },
  ],
  DAMAGE: [
    { key: 'eventDateTime', label: 'Incident date/time', type: 'date', hint: 'ISO datetime when available' },
    { key: 'eventDate', label: 'Incident date', type: 'date' },
    { key: 'odometerKm', label: 'Mileage (km)', type: 'number' },
    { key: 'location', label: 'Location', type: 'string' },
    { key: 'damageDescription', label: 'Damage description', type: 'string' },
    { key: 'description', label: 'Description (alias)', type: 'string' },
    {
      key: 'damageAreas',
      label: 'Damage areas',
      type: 'string',
      hint: 'JSON array or comma-separated traceable area tokens',
    },
    { key: 'damageArea', label: 'Primary damage area', type: 'string' },
    { key: 'locationLabel', label: 'Location label', type: 'string' },
    {
      key: 'damageType',
      label: 'Damage type',
      type: 'enum',
      enumValues: [
        'SCRATCH',
        'DENT',
        'CRACK',
        'BROKEN_PART',
        'PAINT_DAMAGE',
        'GLASS_DAMAGE',
        'TIRE_DAMAGE',
        'INTERIOR_DAMAGE',
        'OTHER',
        'UNKNOWN',
      ],
      hint: 'Use UNKNOWN when not stated — no SCRATCH default',
    },
    {
      key: 'severity',
      label: 'Severity',
      type: 'enum',
      enumValues: ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL', 'UNKNOWN'],
      hint: 'Use UNKNOWN when not stated — no MODERATE default',
    },
    { key: 'drivable', label: 'Drivable', type: 'string' },
    { key: 'thirdPartyInvolved', label: 'Third party involved', type: 'string' },
    { key: 'policeReference', label: 'Police reference', type: 'string' },
    { key: 'insuranceReference', label: 'Insurance reference', type: 'string' },
    { key: 'bookingContext', label: 'Booking context', type: 'string' },
    { key: 'estimatedCostGross', label: 'Estimated cost (cents, gross)', type: 'number' },
    { key: 'estimatedCostCents', label: 'Estimated cost (cents, alias)', type: 'number' },
    {
      key: 'documentKind',
      label: 'Document kind',
      type: 'string',
      hint: 'GUTACHTEN/APPRAISAL links to existing damage instead of creating duplicate',
    },
    { key: 'linkedDamageId', label: 'Linked damage id', type: 'string' },
  ],
  FINE: [
    {
      key: 'licensePlate',
      label: 'License plate',
      type: 'string',
      hint: 'Plate as printed on the notice (e.g. KS-FH-660E)',
    },
    { key: 'eventDate', label: 'Offense date', type: 'date' },
    { key: 'dueDate', label: 'Payment due date', type: 'date' },
    {
      key: 'offenseType',
      label: 'Offense type',
      type: 'enum',
      enumValues: [
        'Parkverstoß',
        'Geschwindigkeitsüberschreitung',
        'Rotlichtverstoß',
        'Halteverstoß',
        'Abstandsverstoß',
        'Handyverstoß',
        'Mautgebühr',
        'Umweltzonenverstoß',
        'Sonstiges',
      ],
    },
    { key: 'location', label: 'Location', type: 'string', hint: 'Place of violation or parking facility' },
    { key: 'issuingAuthority', label: 'Issuing authority', type: 'string' },
    {
      key: 'feeBreakdown',
      label: 'Fee breakdown',
      type: 'string',
      hint: 'Structured line items, one per line: Label: amount EUR (e.g. Parkentgelt: 2,00 EUR)',
    },
    {
      key: 'description',
      label: 'Summary reason',
      type: 'string',
      hint: 'Short plain-language summary of the violation (1-2 sentences)',
    },
    {
      key: 'totalCents',
      label: 'Total amount (cents)',
      type: 'number',
      hint: 'Total payable amount in cents — multiply EUR by 100 (17,50 EUR → 1750)',
    },
    { key: 'reportNumber', label: 'Reference number', type: 'string' },
  ],
  OTHER: [
    { key: 'eventDate', label: 'Date', type: 'date' },
    { key: 'description', label: 'Description', type: 'string' },
  ],
};

export const SUPPORTED_DOCUMENT_TYPES = Object.keys(
  DOCUMENT_FIELD_SCHEMAS,
) as ApplyDocumentExtractionType[];

export const REQUEST_DOCUMENT_TYPES = [
  AUTO_CLASSIFICATION_REQUEST,
  ...SUPPORTED_DOCUMENT_TYPES,
] as const;

export function isSupportedDocumentType(value: unknown): value is ApplyDocumentExtractionType {
  return typeof value === 'string' && (SUPPORTED_DOCUMENT_TYPES as string[]).includes(value);
}

export function isAutoClassificationRequest(value: unknown): value is typeof AUTO_CLASSIFICATION_REQUEST {
  return value === AUTO_CLASSIFICATION_REQUEST;
}

export function isRequestDocumentType(
  value: unknown,
): value is DocumentExtractionType {
  return typeof value === 'string' && (REQUEST_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isApplyDocumentType(value: unknown): value is ApplyDocumentExtractionType {
  return isSupportedDocumentType(value);
}

export function getFieldSchema(documentType: ApplyDocumentExtractionType): FieldDef[] {
  return DOCUMENT_FIELD_SCHEMAS[documentType] ?? DOCUMENT_FIELD_SCHEMAS.OTHER;
}

/** Builds an empty extractedData object (flat keys, nested for `treadDepthMm`). */
export function buildEmptyExtractedData(
  documentType: ApplyDocumentExtractionType,
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

// ── Upload constraints (re-exported from canonical constants) ─────────────

export {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  DOCUMENT_UPLOAD_ACCEPT_ATTR,
  isAllowedMimeType,
  normalizeClientMimeType,
  resolveDocumentUploadMaxMb,
  resolveMaxUploadBytes,
} from './document-upload.constants';
