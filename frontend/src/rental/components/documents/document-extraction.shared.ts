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
  label: string;
  fieldType?: ExtractionFieldType;
}

export const EXTRACTION_TEMPLATES: Record<string, FieldTemplate[]> = {
  SERVICE: [
    { key: 'eventDate', label: 'Service-Datum' },
    { key: 'odometerKm', label: 'Kilometerstand (km)' },
    { key: 'workshopName', label: 'Werkstatt' },
    { key: 'description', label: 'Beschreibung' },
    { key: 'costCents', label: 'Kosten (Cent)' },
    { key: 'invoiceNumber', label: 'Rechnungsnummer' },
    { key: 'nextServiceDate', label: 'Nächster Service' },
    { key: 'nextServiceMileageKm', label: 'Nächster Service (km)' },
  ],
  OIL_CHANGE: [
    { key: 'eventDate', label: 'Ölwechsel-Datum' },
    { key: 'odometerKm', label: 'Kilometerstand (km)' },
    { key: 'workshopName', label: 'Werkstatt' },
    { key: 'oilType', label: 'Öltyp' },
    { key: 'quantityLiters', label: 'Menge (Liter)' },
    { key: 'notes', label: 'Notizen' },
    { key: 'nextOilChangeDate', label: 'Nächster Ölwechsel' },
    { key: 'nextOilChangeMileageKm', label: 'Nächster Ölwechsel (km)' },
  ],
  TIRE: [
    { key: 'eventDate', label: 'Reifen-Datum' },
    { key: 'odometerKm', label: 'Kilometerstand (km)' },
    { key: 'workshopName', label: 'Werkstatt' },
    { key: 'season', label: 'Saison' },
    { key: 'tireBrand', label: 'Marke' },
    { key: 'tireModel', label: 'Modell' },
    { key: 'tireSize', label: 'Größe' },
    { key: 'dot', label: 'DOT' },
    { key: 'action', label: 'Aktion' },
    { key: 'treadDepthMm.fl', label: 'Profil VL (mm)' },
    { key: 'treadDepthMm.fr', label: 'Profil VR (mm)' },
    { key: 'treadDepthMm.rl', label: 'Profil HL (mm)' },
    { key: 'treadDepthMm.rr', label: 'Profil HR (mm)' },
  ],
  BRAKE: [
    { key: 'eventDate', label: 'Bremsen-Datum' },
    { key: 'odometerKm', label: 'Kilometerstand (km)' },
    { key: 'workshopName', label: 'Werkstatt' },
    { key: 'serviceKind', label: 'Art' },
    { key: 'scopeCsv', label: 'Umfang' },
    { key: 'frontPadMm', label: 'Beläge vorn (mm)' },
    { key: 'rearPadMm', label: 'Beläge hinten (mm)' },
    { key: 'frontDiscMm', label: 'Scheiben vorn (mm)' },
    { key: 'rearDiscMm', label: 'Scheiben hinten (mm)' },
    { key: 'description', label: 'Beschreibung' },
    { key: 'costCents', label: 'Kosten (Cent)' },
  ],
  BATTERY: [
    { key: 'eventDate', label: 'Batterie-Datum' },
    { key: 'odometerKm', label: 'Kilometerstand (km)' },
    { key: 'workshopName', label: 'Werkstatt' },
    { key: 'recordKind', label: 'Art' },
    { key: 'scope', label: 'Bereich (LV/HV)' },
    { key: 'batteryType', label: 'Batterietyp' },
    { key: 'voltageV', label: 'Spannung (V)' },
    { key: 'sohPercent', label: 'SOH (%)' },
    { key: 'restingVoltage', label: 'Ruhespannung (V)' },
    { key: 'testResult', label: 'Testergebnis' },
    { key: 'notes', label: 'Notizen' },
  ],
  TUV_REPORT: [
    { key: 'eventDate', label: 'TÜV-Datum' },
    { key: 'odometerKm', label: 'Kilometerstand (km)' },
    { key: 'workshopName', label: 'Prüfstelle' },
    { key: 'result', label: 'Ergebnis' },
    { key: 'validUntil', label: 'Gültig bis' },
    { key: 'defects', label: 'Mängel' },
    { key: 'reportNumber', label: 'Berichtsnummer' },
    { key: 'notes', label: 'Notizen' },
  ],
  BOKRAFT_REPORT: [
    { key: 'eventDate', label: 'BOKraft-Datum' },
    { key: 'odometerKm', label: 'Kilometerstand (km)' },
    { key: 'workshopName', label: 'Prüfstelle' },
    { key: 'result', label: 'Ergebnis' },
    { key: 'validUntil', label: 'Gültig bis' },
    { key: 'defects', label: 'Mängel' },
    { key: 'reportNumber', label: 'Berichtsnummer' },
    { key: 'notes', label: 'Notizen' },
  ],
  VEHICLE_CONDITION: [
    { key: 'eventDate', label: 'Datum' },
    { key: 'odometerKm', label: 'Kilometerstand (km)' },
    { key: 'description', label: 'Zustandsbericht' },
  ],
  INVOICE: [
    { key: 'invoiceNumber', label: 'Rechnungsnummer' },
    { key: 'invoiceDate', label: 'Rechnungsdatum', fieldType: 'date' },
    { key: 'eventDate', label: 'Rechnungsdatum (alt)', fieldType: 'date' },
    { key: 'dueDate', label: 'Fällig am', fieldType: 'date' },
    { key: 'currency', label: 'Währung' },
    { key: 'supplier', label: 'Lieferant' },
    { key: 'vendorName', label: 'Anbieter (Alias)' },
    { key: 'customer', label: 'Kunde / Empfänger' },
    { key: 'subtotalNet', label: 'Netto (Cent)', fieldType: 'currency' },
    { key: 'totalTax', label: 'MwSt. (Cent)', fieldType: 'currency' },
    { key: 'totalGross', label: 'Brutto (Cent)', fieldType: 'currency' },
    { key: 'taxRatePercent', label: 'Steuersatz (%)' },
    { key: 'taxExemptReason', label: 'Steuerbefreiung' },
    { key: 'reverseCharge', label: 'Reverse Charge' },
    { key: 'creditNoteReference', label: 'Gutschrift-Referenz' },
    { key: 'originalInvoiceReference', label: 'Ursprungsrechnung' },
    { key: 'amountSemantics', label: 'Betragssemantik' },
    { key: 'taxSemantics', label: 'Steuersemantik' },
    { key: 'title', label: 'Titel' },
    { key: 'description', label: 'Beschreibung' },
    { key: 'totalCents', label: 'Betrag (Cent, Alias)', fieldType: 'currency' },
  ],
  DAMAGE: [
    { key: 'eventDate', label: 'Schadensdatum' },
    { key: 'odometerKm', label: 'Kilometerstand (km)' },
    { key: 'location', label: 'Ort' },
    { key: 'damageArea', label: 'Schadensbereich' },
    { key: 'description', label: 'Beschreibung' },
    { key: 'severity', label: 'Schweregrad' },
    { key: 'estimatedCostGross', label: 'Geschätzte Kosten' },
  ],
  ACCIDENT: [
    { key: 'eventDate', label: 'Unfalldatum' },
    { key: 'odometerKm', label: 'Kilometerstand (km)' },
    { key: 'location', label: 'Ort' },
    { key: 'description', label: 'Beschreibung' },
    { key: 'policeReport', label: 'Polizeibericht' },
    { key: 'opponentInvolved', label: 'Unfallgegner' },
    { key: 'drivableAfterIncident', label: 'Fahrbereit danach' },
    { key: 'severity', label: 'Schweregrad' },
    { key: 'estimatedCostGross', label: 'Geschätzte Kosten' },
  ],
  FINE: [
    { key: 'licensePlate', label: 'Kennzeichen' },
    { key: 'eventDate', label: 'Datum', fieldType: 'date' },
    { key: 'dueDate', label: 'Zahlungsfrist', fieldType: 'date' },
    { key: 'offenseType', label: 'Art des Verstoßes' },
    { key: 'location', label: 'Ort' },
    { key: 'issuingAuthority', label: 'Ausstellende Behörde / Firma' },
    { key: 'feeBreakdown', label: 'Gebührenaufstellung', fieldType: 'multiline' },
    { key: 'description', label: 'Grund (Kurzfassung)', fieldType: 'multiline' },
    { key: 'totalCents', label: 'Betrag', fieldType: 'currency' },
    { key: 'reportNumber', label: 'Aktenzeichen' },
  ],
  OTHER: [
    { key: 'eventDate', label: 'Datum' },
    { key: 'description', label: 'Beschreibung' },
  ],
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  SERVICE: 'Service-Nachweis',
  OIL_CHANGE: 'Ölwechsel',
  TIRE: 'Reifen-Nachweis',
  BRAKE: 'Bremsen-Nachweis',
  BATTERY: 'Batterie-Nachweis',
  TUV_REPORT: 'TÜV / HU',
  BOKRAFT_REPORT: 'BOKraft',
  VEHICLE_CONDITION: 'Zulassung / Fahrzeugschein',
  INVOICE: 'Rechnung',
  DAMAGE: 'Schadensbericht',
  ACCIDENT: 'Unfallbericht',
  FINE: 'Bußgeld',
  OTHER: 'Sonstiges Dokument',
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
  | 'done'
  | 'failed'
  | 'cancelled';

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
  options?: { locale?: string },
): ReviewField[] {
  const locale = resolveDateLocale(options?.locale);
  const template = EXTRACTION_TEMPLATES[docType] || EXTRACTION_TEMPLATES.OTHER;
  return template.map((f) => {
    const raw = readField(extracted, f.key);
    return {
      key: f.key,
      label: f.label,
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

export const FLOW_STATUS_LABEL_DE: Record<FlowStatus, string> = {
  idle: 'Bereit',
  validating: 'Wird geprüft…',
  uploading: 'Wird hochgeladen…',
  stored: 'Gespeichert',
  queued: 'In Warteschlange',
  retrying: 'Erneuter Versuch…',
  processing: 'KI verarbeitet…',
  ocr: 'OCR läuft…',
  classifying: 'Dokumenttyp wird erkannt…',
  extracting: 'Daten werden extrahiert…',
  validating_plausibility: 'Plausibilität wird geprüft…',
  awaiting_type: 'Typauswahl erforderlich',
  ready: 'Zur Prüfung',
  applying: 'Wird angewendet…',
  done: 'Angewendet',
  failed: 'Fehler',
  cancelled: 'Abgebrochen',
};
