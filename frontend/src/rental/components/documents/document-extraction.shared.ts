/** Shared AI document extraction types & helpers (Documents tab + AI Upload view). */

import { DOCUMENT_UPLOAD_ACCEPT_ATTR } from '../../lib/document-upload.constants';
import {
  formatCentsForDisplay,
  formatIsoDateForDisplay,
  parseCurrencyDisplayToCents,
  parseDisplayDateToIso,
  resolveDateLocale,
  type ExtractionFieldType,
} from '../../lib/document-extraction-field-format';

export type { ExtractionFieldType };

interface FieldTemplate {
  key: string;
  fieldType?: ExtractionFieldType;
}

export const EXTRACTION_TEMPLATES: Record<string, FieldTemplate[]> = {
  SERVICE: [
    { key: 'eventDate' },
    { key: 'odometerKm' },
    { key: 'workshopName' },
    { key: 'description' },
    { key: 'costCents' },
    { key: 'invoiceNumber' },
    { key: 'nextServiceDate' },
    { key: 'nextServiceMileageKm' },
  ],
  OIL_CHANGE: [
    { key: 'eventDate' },
    { key: 'odometerKm' },
    { key: 'workshopName' },
    { key: 'oilType' },
    { key: 'quantityLiters' },
    { key: 'notes' },
    { key: 'nextOilChangeDate' },
    { key: 'nextOilChangeMileageKm' },
  ],
  TIRE: [
    { key: 'measurementDate', fieldType: 'date' },
    { key: 'eventDate', fieldType: 'date' },
    { key: 'odometerKm' },
    { key: 'workshopName' },
    { key: 'treadDepthUnit' },
    { key: 'pressureUnit' },
    { key: 'season' },
    { key: 'tireBrand' },
    { key: 'tireModel' },
    { key: 'tireSize' },
    { key: 'dot' },
    { key: 'action' },
    { key: 'treadDepthMm.fl' },
    { key: 'treadDepthMm.fr' },
    { key: 'treadDepthMm.rl' },
    { key: 'treadDepthMm.rr' },
    { key: 'pressureBar.fl' },
    { key: 'pressureBar.fr' },
    { key: 'pressureBar.rl' },
    { key: 'pressureBar.rr' },
  ],
  BRAKE: [
    { key: 'measurementDate', fieldType: 'date' },
    { key: 'eventDate', fieldType: 'date' },
    { key: 'odometerKm' },
    { key: 'workshopName' },
    { key: 'serviceKind' },
    { key: 'scopeCsv' },
    { key: 'padThicknessUnit' },
    { key: 'discThicknessUnit' },
    { key: 'frontPadMm' },
    { key: 'rearPadMm' },
    { key: 'frontDiscMm' },
    { key: 'rearDiscMm' },
    { key: 'minimumPadMmFront' },
    { key: 'minimumPadMmRear' },
    { key: 'minimumDiscMmFront' },
    { key: 'minimumDiscMmRear' },
    { key: 'workshopFinding' },
    { key: 'description' },
    { key: 'costCents' },
  ],
  BATTERY: [
    { key: 'measurementDate', fieldType: 'date' },
    { key: 'eventDate', fieldType: 'date' },
    { key: 'odometerKm' },
    { key: 'workshopName' },
    { key: 'scope' },
    { key: 'recordKind' },
    { key: 'measurementType' },
    { key: 'batteryType' },
    { key: 'voltageV' },
    { key: 'sohPercent' },
    { key: 'sohSource' },
    { key: 'capacityKwh' },
    { key: 'capacityAh' },
    { key: 'restingVoltage' },
    { key: 'temperatureC' },
    { key: 'temperatureContext' },
    { key: 'deviceOrWorkshop' },
    { key: 'testResult' },
    { key: 'notes' },
  ],
  TUV_REPORT: [
    { key: 'inspectionDate', fieldType: 'date' },
    { key: 'eventDate', fieldType: 'date' },
    { key: 'validUntil', fieldType: 'date' },
    { key: 'result' },
    { key: 'defectLevel' },
    { key: 'defects' },
    { key: 'reinspectionRequired' },
    { key: 'reinspectionDeadline', fieldType: 'date' },
    { key: 'issuingOrganization' },
    { key: 'workshopName' },
    { key: 'reportNumber' },
    { key: 'mileage' },
    { key: 'odometerKm' },
    { key: 'notes' },
  ],
  BOKRAFT_REPORT: [
    { key: 'inspectionDate', fieldType: 'date' },
    { key: 'eventDate', fieldType: 'date' },
    { key: 'validUntil', fieldType: 'date' },
    { key: 'result' },
    { key: 'defectLevel' },
    { key: 'defects' },
    { key: 'reinspectionRequired' },
    { key: 'reinspectionDeadline', fieldType: 'date' },
    { key: 'issuingOrganization' },
    { key: 'workshopName' },
    { key: 'reportNumber' },
    { key: 'mileage' },
    { key: 'odometerKm' },
    { key: 'notes' },
  ],
  VEHICLE_CONDITION: [
    { key: 'archiveSubtype' },
    { key: 'sender' },
    { key: 'recipient' },
    { key: 'documentDate', fieldType: 'date' },
    { key: 'eventDate', fieldType: 'date' },
    { key: 'referenceNumber' },
    { key: 'subject' },
    { key: 'deadlines', fieldType: 'multiline' },
    { key: 'mentionedEntities', fieldType: 'multiline' },
    { key: 'summary', fieldType: 'multiline' },
    { key: 'actionRequired', fieldType: 'multiline' },
    { key: 'odometerKm' },
  ],
  INVOICE: [
    { key: 'invoiceNumber' },
    { key: 'invoiceDate', fieldType: 'date' },
    { key: 'eventDate', fieldType: 'date' },
    { key: 'dueDate', fieldType: 'date' },
    { key: 'currency' },
    { key: 'supplier' },
    { key: 'vendorName' },
    { key: 'customer' },
    { key: 'subtotalNet', fieldType: 'currency' },
    { key: 'totalTax', fieldType: 'currency' },
    { key: 'totalGross', fieldType: 'currency' },
    { key: 'taxRatePercent' },
    { key: 'taxExemptReason' },
    { key: 'reverseCharge' },
    { key: 'creditNoteReference' },
    { key: 'originalInvoiceReference' },
    { key: 'amountSemantics' },
    { key: 'taxSemantics' },
    { key: 'title' },
    { key: 'description' },
    { key: 'totalCents', fieldType: 'currency' },
  ],
  DAMAGE: [
    { key: 'eventDateTime', fieldType: 'date' },
    { key: 'eventDate' },
    { key: 'odometerKm' },
    { key: 'location' },
    { key: 'damageDescription' },
    { key: 'description' },
    { key: 'damageAreas' },
    { key: 'damageArea' },
    { key: 'locationLabel' },
    { key: 'damageType' },
    { key: 'severity' },
    { key: 'drivable' },
    { key: 'thirdPartyInvolved' },
    { key: 'policeReference' },
    { key: 'insuranceReference' },
    { key: 'bookingContext' },
    { key: 'estimatedCostGross', fieldType: 'currency' },
    { key: 'documentKind' },
    { key: 'linkedDamageId' },
  ],
  ACCIDENT: [
    { key: 'eventDateTime', fieldType: 'date' },
    { key: 'eventDate' },
    { key: 'odometerKm' },
    { key: 'location' },
    { key: 'damageDescription' },
    { key: 'description' },
    { key: 'damageAreas' },
    { key: 'damageArea' },
    { key: 'damageType' },
    { key: 'severity' },
    { key: 'drivable' },
    { key: 'drivableAfterIncident' },
    { key: 'thirdPartyInvolved' },
    { key: 'opponentInvolved' },
    { key: 'policeReference' },
    { key: 'policeReport' },
    { key: 'insuranceReference' },
    { key: 'bookingContext' },
    { key: 'estimatedCostGross', fieldType: 'currency' },
    { key: 'accidentApplyConfirmed' },
    { key: 'documentKind' },
    { key: 'linkedDamageId' },
  ],
  FINE: [
    { key: 'licensePlate' },
    { key: 'eventDate', fieldType: 'date' },
    { key: 'dueDate', fieldType: 'date' },
    { key: 'offenseType' },
    { key: 'location' },
    { key: 'issuingAuthority' },
    { key: 'feeBreakdown', fieldType: 'multiline' },
    { key: 'description', fieldType: 'multiline' },
    { key: 'totalCents', fieldType: 'currency' },
    { key: 'reportNumber' },
  ],
  OTHER: [
    { key: 'archiveSubtype' },
    { key: 'sender' },
    { key: 'recipient' },
    { key: 'documentDate', fieldType: 'date' },
    { key: 'eventDate', fieldType: 'date' },
    { key: 'referenceNumber' },
    { key: 'subject' },
    { key: 'deadlines', fieldType: 'multiline' },
    { key: 'mentionedEntities', fieldType: 'multiline' },
    { key: 'summary', fieldType: 'multiline' },
    { key: 'actionRequired', fieldType: 'multiline' },
  ],
};


export const ACCEPT_ATTR = DOCUMENT_UPLOAD_ACCEPT_ATTR;

export type FlowStatus =
  | 'idle'
  | 'validating'
  | 'uploading'
  | 'stored'
  | 'queued'
  | 'retrying'
  | 'processing'
  | 'ocr'
  | 'classifying'
  | 'extracting'
  | 'validating_plausibility'
  | 'awaiting_type'
  | 'ready'
  | 'applying'
  | 'partially_done'
  | 'apply_failed'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'duplicate_blocked';

export type PlausibilityStatus = 'OK' | 'WARNING' | 'BLOCKER';

export interface PlausibilityCheck {
  code: string;
  status: PlausibilityStatus;
  message: string;
  source: string;
}

export interface Plausibility {
  overallStatus: PlausibilityStatus;
  checks: PlausibilityCheck[];
  recommendedHumanReviewNotes?: string[];
  dimoContextAvailable?: boolean;
}

export interface ReviewField {
  key: string;
  label: string;
  value: string;
  fieldType?: ExtractionFieldType;
}

export function mapFlowStatus(serverStatus: string | undefined, stage?: string): FlowStatus {
  // Lazy import avoided — inline minimal mapping for legacy callers without stage.
  switch (serverStatus) {
    case 'QUEUED':
    case 'PENDING':
      return 'queued';
    case 'AWAITING_DOCUMENT_TYPE':
      return 'awaiting_type';
    case 'PROCESSING':
      if (stage === 'OCR') return 'ocr';
      if (stage === 'CLASSIFICATION') return 'classifying';
      if (stage === 'EXTRACTION') return 'extracting';
      if (stage === 'VALIDATION') return 'validating_plausibility';
      if (stage === 'UPLOAD' || stage === 'STORAGE') return 'stored';
      return 'processing';
    case 'READY_FOR_REVIEW':
      return 'ready';
    case 'CONFIRMED':
      return 'applying';
    case 'APPLIED':
      return 'done';
    case 'FAILED':
    case 'REJECTED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'processing';
  }
}

export function readField(extracted: Record<string, unknown> | null | undefined, key: string): string {
  if (!extracted) return '';
  let v: unknown;
  if (key.includes('.')) {
    const [parent, child] = key.split('.');
    const parentVal = extracted[parent];
    v =
      parentVal && typeof parentVal === 'object'
        ? (parentVal as Record<string, unknown>)[child]
        : undefined;
  } else {
    v = extracted[key];
  }
  return v == null ? '' : String(v);
}

function formatFieldValue(
  fieldType: ExtractionFieldType | undefined,
  raw: string,
  locale: string,
): string {
  if (!raw) return '';
  switch (fieldType) {
    case 'date':
      return formatIsoDateForDisplay(raw, locale) || raw;
    case 'currency':
      return formatCentsForDisplay(raw, locale);
    default:
      return raw;
  }
}

export function buildReviewFields(
  docType: string,
  extracted: Record<string, unknown> | null | undefined,
  options?: { locale?: string; resolveFieldLabel?: (fieldKey: string) => string },
): ReviewField[] {
  const locale = resolveDateLocale(options?.locale);
  const template = EXTRACTION_TEMPLATES[docType] || EXTRACTION_TEMPLATES.OTHER;
  return template.map((f) => {
    const raw = readField(extracted, f.key);
    return {
      key: f.key,
      label: options?.resolveFieldLabel?.(f.key) ?? f.key,
      fieldType: f.fieldType,
      value: formatFieldValue(f.fieldType, raw, locale),
    };
  });
}

export function parseReviewFieldsForConfirm(
  fields: ReviewField[],
  options?: { locale?: string },
): Record<string, unknown> {
  const locale = resolveDateLocale(options?.locale);
  const confirmedData: Record<string, unknown> = {};
  for (const f of fields) {
    const trimmed = f.value.trim();
    let value: unknown = trimmed === '' ? null : trimmed;
    if (trimmed !== '') {
      if (f.fieldType === 'date') {
        value = parseDisplayDateToIso(trimmed, locale) ?? trimmed;
      } else if (f.fieldType === 'currency') {
        value = parseCurrencyDisplayToCents(trimmed);
      }
    }
    if (f.key.includes('.')) {
      const [parent, child] = f.key.split('.');
      if (!confirmedData[parent]) confirmedData[parent] = {};
      (confirmedData[parent] as Record<string, unknown>)[child] = value;
    } else {
      confirmedData[f.key] = value;
    }
  }
  return confirmedData;
}

