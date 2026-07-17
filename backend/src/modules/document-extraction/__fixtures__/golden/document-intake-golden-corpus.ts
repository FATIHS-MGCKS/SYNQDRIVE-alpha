import { CLASSIFICATION_UNKNOWN } from '@modules/ai/documents/document-classification.types';
import { BATTERY_LV_COMPLETE } from '../document-battery-fixtures';
import { BRAKE_COMPLETE } from '../document-brake-fixtures';
import { CUSTOMER_CORRESPONDENCE, INSURANCE_LETTER } from '../document-archive-fixtures';
import { ACCIDENT_COMPLETE, DAMAGE_COMPLETE } from '../document-damage-fixtures';
import { DRIVER_IDENTIFICATION_REQUEST_COMPLETE } from '../document-driver-ident-fixtures';
import { FINE_COMPLETE } from '../document-fine-fixtures';
import {
  INVOICE_COMPLETE_19,
  INVOICE_COMPLETE_7,
  INVOICE_CREDIT_NOTE,
  INVOICE_MULTI_RATE,
  INVOICE_TAX_FREE,
} from '../document-invoice-fixtures';
import { BOKRAFT_NO_DEFECT, TUV_NO_DEFECT } from '../document-inspection-fixtures';
import { REMINDER_COMPLETE } from '../document-reminder-fixtures';
import { SERVICE_COMPLETE } from '../document-service-fixtures';
import { TIRE_COMPLETE } from '../document-tire-fixtures';
import type {
  DocumentIntakeGoldenCase,
  GoldenCorpusExtractionMock,
} from './document-intake-golden-corpus.types';
import { DOCUMENT_INTAKE_GOLDEN_CORPUS_VERSION } from './document-intake-golden-corpus.types';
import type { DocumentClassificationLlmResponse } from '@modules/ai/documents/document-classification.types';
import type { ApplyDocumentExtractionType } from '../../document-extraction.schemas';
import type { DocumentCategory, DocumentSubtype } from '../../document-taxonomy.types';

const DEFAULT_MISTRAL_MODEL = 'mistral-small-latest';

function defineGoldenCase(input: {
  id: string;
  label: string;
  documentType: ApplyDocumentExtractionType;
  expectedCategory: DocumentCategory;
  expectedSubtype: DocumentSubtype;
  ocrText: string;
  classificationMock: DocumentClassificationLlmResponse;
  extractionFields: Record<string, unknown>;
  expectedFieldKeys: readonly string[];
  reviewNotes?: string[];
}): DocumentIntakeGoldenCase {
  const extractionMock: GoldenCorpusExtractionMock = {
    documentType: input.documentType,
    fields: input.extractionFields,
    recommendedHumanReviewNotes: input.reviewNotes,
  };
  return {
    id: input.id,
    label: input.label,
    documentType: input.documentType,
    expectedCategory: input.expectedCategory,
    expectedSubtype: input.expectedSubtype,
    ocrText: input.ocrText,
    classificationMock: input.classificationMock,
    extractionMock,
    expectedFieldKeys: input.expectedFieldKeys,
    mistralModel: DEFAULT_MISTRAL_MODEL,
    synthetic: true,
    privacySafe: true,
  };
}

export const GOLDEN_SERVICE: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-service-001',
  label: 'Service report',
  documentType: 'SERVICE',
  expectedCategory: 'TECHNICAL',
  expectedSubtype: 'SERVICE_REPORT',
  ocrText: `Werkstattbericht — SynqDrive Demo GmbH
Fahrzeug: M-SY 1001 | KM-Stand: 84.500
Datum: 12.05.2026
Werkstatt: Autohaus Nord Demo
Leistung: Inspektion inkl. Filter
Netto: 420,00 EUR`,
  classificationMock: {
    detectedDocumentType: 'SERVICE',
    documentCategory: 'TECHNICAL',
    documentSubtype: 'SERVICE_REPORT',
    confidence: 0.93,
    rationale: 'Workshop maintenance report with odometer and service items',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [
      { identifierType: 'license_plate', value: 'M-SY 1001', evidencePage: 1 },
    ],
  },
  extractionFields: SERVICE_COMPLETE,
  expectedFieldKeys: ['eventDate', 'odometerKm', 'workshopName'],
});

export const GOLDEN_TIRE: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-tire-001',
  label: 'Tire measurement report',
  documentType: 'TIRE',
  expectedCategory: 'TECHNICAL',
  expectedSubtype: 'SERVICE_REPORT',
  ocrText: `Reifenprüfbericht — SynqDrive Demo GmbH
KFZ: M-SY 1002 | KM: 84.210
Datum: 10.03.2026
Werkstatt: Euromaster Demo Berlin
Profiltiefe mm: VL 5,8 VR 5,6 HL 6,1 HR 6,0
Reifendruck bar: VL 2,4 VR 2,4 HL 2,5 HR 2,5
Reifengröße: 225/45 R17`,
  classificationMock: {
    detectedDocumentType: 'TIRE',
    documentCategory: 'TECHNICAL',
    documentSubtype: 'SERVICE_REPORT',
    confidence: 0.9,
    rationale: 'Tire tread depth and pressure measurement table',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [{ identifierType: 'license_plate', value: 'M-SY 1002', evidencePage: 1 }],
  },
  extractionFields: TIRE_COMPLETE,
  expectedFieldKeys: ['measurementDate', 'treadDepthMm', 'workshopName'],
});

export const GOLDEN_BRAKE: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-brake-001',
  label: 'Brake inspection report',
  documentType: 'BRAKE',
  expectedCategory: 'TECHNICAL',
  expectedSubtype: 'SERVICE_REPORT',
  ocrText: `Bremsenprüfbericht — SynqDrive Demo GmbH
Fahrzeug M-SY 1003 | KM 92.100 | 02.04.2026
Werkstatt: ATU Service Demo
Belag vorn 6,5 mm | hinten 6,0 mm
Scheibe vorn 24,0 mm | hinten 23,2 mm
Befund: Beläge und Scheiben im grünen Bereich`,
  classificationMock: {
    detectedDocumentType: 'BRAKE',
    documentCategory: 'TECHNICAL',
    documentSubtype: 'SERVICE_REPORT',
    confidence: 0.91,
    rationale: 'Brake pad and disc thickness measurements',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [],
  },
  extractionFields: BRAKE_COMPLETE,
  expectedFieldKeys: ['measurementDate', 'frontPadMm', 'rearPadMm'],
});

export const GOLDEN_BATTERY: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-battery-001',
  label: 'LV battery test report',
  documentType: 'BATTERY',
  expectedCategory: 'TECHNICAL',
  expectedSubtype: 'SERVICE_REPORT',
  ocrText: `Batterietest — SynqDrive Demo GmbH
Fahrzeug M-SY 1004 | 01.05.2026
Scope: LV | Typ: AGM
Ruhespannung: 12,61 V | Startspannung: 10,91 V
Ladespannung: 14,11 V | Temperatur: 18 °C
Gerät: Midtronics EXP-1000 Demo`,
  classificationMock: {
    detectedDocumentType: 'BATTERY',
    documentCategory: 'TECHNICAL',
    documentSubtype: 'SERVICE_REPORT',
    confidence: 0.89,
    rationale: 'Battery voltage measurement report',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [],
  },
  extractionFields: BATTERY_LV_COMPLETE,
  expectedFieldKeys: ['measurementDate', 'scope', 'voltageV'],
});

export const GOLDEN_TUV: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-tuv-001',
  label: 'TÜV report without defects',
  documentType: 'TUV_REPORT',
  expectedCategory: 'COMPLIANCE',
  expectedSubtype: 'TUV_REPORT',
  ocrText: `Hauptuntersuchung (HU) — Prüfbericht
Kennzeichen: M-SY 1005 | KM 45.230
Prüfdatum: 01.06.2026 | Gültig bis: 01.06.2028
Ergebnis: ohne Mängel
Organisation: DEKRA Demo Stuttgart
Bericht-Nr.: HU-2026-001`,
  classificationMock: {
    detectedDocumentType: 'TUV_REPORT',
    documentCategory: 'COMPLIANCE',
    documentSubtype: 'TUV_REPORT',
    confidence: 0.95,
    rationale: 'Periodic vehicle inspection certificate (HU/TÜV)',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [{ identifierType: 'report_number', value: 'HU-2026-001', evidencePage: 1 }],
  },
  extractionFields: TUV_NO_DEFECT,
  expectedFieldKeys: ['inspectionDate', 'validUntil', 'result'],
});

export const GOLDEN_BOKRAFT: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-bokraft-001',
  label: 'BOKraft emissions report',
  documentType: 'BOKRAFT_REPORT',
  expectedCategory: 'COMPLIANCE',
  expectedSubtype: 'BOKRAFT_REPORT',
  ocrText: `Abgasuntersuchung (AU) — Prüfbericht
Kennzeichen: M-SY 1006 | KM 55.000
Prüfdatum: 01.07.2026 | Gültig bis: 01.07.2027
Ergebnis: ohne Beanstandungen
Station: AU-Station Nord Demo
Bericht-Nr.: AU-2026-010`,
  classificationMock: {
    detectedDocumentType: 'BOKRAFT_REPORT',
    documentCategory: 'COMPLIANCE',
    documentSubtype: 'BOKRAFT_REPORT',
    confidence: 0.94,
    rationale: 'Emissions inspection certificate (AU/BOKraft)',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [],
  },
  extractionFields: BOKRAFT_NO_DEFECT,
  expectedFieldKeys: ['inspectionDate', 'validUntil', 'result'],
});

export const GOLDEN_INVOICE_19: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-invoice-19-001',
  label: 'Invoice 19% VAT',
  documentType: 'INVOICE',
  expectedCategory: 'FINANCE',
  expectedSubtype: 'INVOICE',
  ocrText: `Rechnung INV-2026-001 — SynqDrive Demo GmbH
Datum: 10.03.2026 | Fällig: 09.04.2026
Lieferant: Werkstatt Müller Demo GmbH
Empfänger: SynqDrive Demo GmbH
Position: Ölwechsel | Netto 100,00 EUR | MwSt 19% 19,00 EUR | Brutto 119,00 EUR`,
  classificationMock: {
    detectedDocumentType: 'INVOICE',
    documentCategory: 'FINANCE',
    documentSubtype: 'INVOICE',
    confidence: 0.96,
    rationale: 'Vendor invoice with line items and VAT breakdown',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [{ identifierType: 'invoice_number', value: 'INV-2026-001', evidencePage: 1 }],
  },
  extractionFields: INVOICE_COMPLETE_19,
  expectedFieldKeys: ['invoiceNumber', 'invoiceDate', 'totalCents', 'taxRatePercent'],
});

export const GOLDEN_INVOICE_7: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-invoice-7-001',
  label: 'Invoice 7% VAT',
  documentType: 'INVOICE',
  expectedCategory: 'FINANCE',
  expectedSubtype: 'INVOICE',
  ocrText: `Rechnung INV-2026-007 — SynqDrive Demo GmbH
Datum: 11.03.2026
Lieferant: Buchhandlung Demo
Netto 100,00 EUR | MwSt 7% 7,00 EUR | Brutto 107,00 EUR`,
  classificationMock: {
    detectedDocumentType: 'INVOICE',
    documentCategory: 'FINANCE',
    documentSubtype: 'INVOICE',
    confidence: 0.94,
    rationale: 'Invoice with reduced 7% VAT rate',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [{ identifierType: 'invoice_number', value: 'INV-2026-007', evidencePage: 1 }],
  },
  extractionFields: INVOICE_COMPLETE_7,
  expectedFieldKeys: ['invoiceNumber', 'taxRatePercent', 'totalCents'],
});

export const GOLDEN_INVOICE_TAX_FREE: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-invoice-tax-free-001',
  label: 'Tax-free invoice',
  documentType: 'INVOICE',
  expectedCategory: 'FINANCE',
  expectedSubtype: 'INVOICE',
  ocrText: `Rechnung INV-TF-1 — steuerfrei — SynqDrive Demo GmbH
Datum: 12.03.2026
Grund: §4 UStG — innergemeinschaftliche Lieferung
Netto 50,00 EUR | MwSt 0,00 EUR | Brutto 50,00 EUR`,
  classificationMock: {
    detectedDocumentType: 'INVOICE',
    documentCategory: 'FINANCE',
    documentSubtype: 'INVOICE',
    confidence: 0.92,
    rationale: 'Tax-exempt invoice with explicit exemption reason',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [],
  },
  extractionFields: INVOICE_TAX_FREE,
  expectedFieldKeys: ['invoiceNumber', 'taxSemantics', 'totalGross'],
});

export const GOLDEN_INVOICE_MULTI_RATE: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-invoice-multi-rate-001',
  label: 'Multi-rate invoice',
  documentType: 'INVOICE',
  expectedCategory: 'FINANCE',
  expectedSubtype: 'INVOICE',
  ocrText: `Rechnung INV-MIX-1 — SynqDrive Demo GmbH
Datum: 11.03.2026
Position A: Netto 50,00 EUR MwSt 19% | Position B: Netto 30,00 EUR MwSt 7%
Gesamt Netto 80,00 EUR | MwSt 11,60 EUR | Brutto 91,60 EUR`,
  classificationMock: {
    detectedDocumentType: 'INVOICE',
    documentCategory: 'FINANCE',
    documentSubtype: 'INVOICE',
    confidence: 0.93,
    rationale: 'Invoice with multiple VAT rate lines',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [],
  },
  extractionFields: INVOICE_MULTI_RATE,
  expectedFieldKeys: ['invoiceNumber', 'taxLines', 'totalGross'],
});

export const GOLDEN_CREDIT_NOTE: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-credit-note-001',
  label: 'Credit note',
  documentType: 'INVOICE',
  expectedCategory: 'FINANCE',
  expectedSubtype: 'CREDIT_NOTE',
  ocrText: `Gutschrift CN-2026-001 — SynqDrive Demo GmbH
Bezug: Rechnung INV-2026-001
Datum: 14.03.2026
Betrag: -59,50 EUR (brutto)`,
  classificationMock: {
    detectedDocumentType: 'INVOICE',
    documentCategory: 'FINANCE',
    documentSubtype: 'CREDIT_NOTE',
    confidence: 0.9,
    rationale: 'Credit note referencing original invoice with negative total',
    sourcePages: [1],
    alternatives: [
      {
        documentCategory: 'FINANCE',
        documentSubtype: 'INVOICE',
        confidence: 0.62,
        rationale: 'Contains invoice reference fields',
      },
    ],
    detectedIdentifiers: [
      { identifierType: 'invoice_number', value: 'CN-2026-001', evidencePage: 1 },
      { identifierType: 'reference_number', value: 'INV-2026-001', evidencePage: 1 },
    ],
  },
  extractionFields: INVOICE_CREDIT_NOTE,
  expectedFieldKeys: ['invoiceNumber', 'isCreditNote', 'totalCents'],
  reviewNotes: ['Verify credit note references original invoice'],
});

export const GOLDEN_REMINDER: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-reminder-001',
  label: 'Payment reminder',
  documentType: 'INVOICE',
  expectedCategory: 'FINANCE',
  expectedSubtype: 'REMINDER',
  ocrText: `Zahlungserinnerung / Mahnung Stufe 1 — SynqDrive Demo GmbH
Rechnung INV-2026-001 | offen seit 10.04.2026
Fällig war: 09.04.2026 | Mahngebühr 5,00 EUR
Offener Betrag: 119,00 EUR`,
  classificationMock: {
    detectedDocumentType: 'INVOICE',
    documentCategory: 'FINANCE',
    documentSubtype: 'REMINDER',
    confidence: 0.88,
    rationale: 'Dunning letter referencing overdue invoice',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [{ identifierType: 'invoice_number', value: 'INV-2026-001', evidencePage: 1 }],
  },
  extractionFields: REMINDER_COMPLETE,
  expectedFieldKeys: ['invoiceNumber', 'reminderLevel', 'outstandingCents'],
});

export const GOLDEN_FINE: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-fine-001',
  label: 'Fine notice',
  documentType: 'FINE',
  expectedCategory: 'AUTHORITY',
  expectedSubtype: 'FINE_NOTICE',
  ocrText: `Bußgeldbescheid VB-2026-1199
Kennzeichen: M-SY 1010
Tatzeit: 24.10.2025 | Ort: Parkhaus Demo Platz
Verstoß: Parkverstoß | Betrag: 17,50 EUR
Behörde: Stadt Demo`,
  classificationMock: {
    detectedDocumentType: 'FINE',
    documentCategory: 'AUTHORITY',
    documentSubtype: 'FINE_NOTICE',
    confidence: 0.96,
    rationale: 'Authority penalty notice with offense and payable amount',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [
      { identifierType: 'fine_number', value: 'VB-2026-1199', evidencePage: 1 },
      { identifierType: 'license_plate', value: 'M-SY 1010', evidencePage: 1 },
    ],
  },
  extractionFields: {
    ...FINE_COMPLETE,
    licensePlate: 'M-SY 1010',
    reportNumber: 'VB-2026-1199',
  },
  expectedFieldKeys: ['licensePlate', 'eventDate', 'totalCents', 'offenseType'],
});

export const GOLDEN_DRIVER_IDENTIFICATION: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-driver-ident-001',
  label: 'Driver identification request',
  documentType: 'OTHER',
  expectedCategory: 'AUTHORITY',
  expectedSubtype: 'DRIVER_IDENTIFICATION_REQUEST',
  ocrText: `Anhörung / Fahrerermittlung
Aktenzeichen: AZ-2026-4412
Behörde: Stadt Demo — Ordnungsamt
Kennzeichen: M-SY 1001 | Tatzeit: 12.03.2026
Frist zur Stellungnahme: 20.04.2026`,
  classificationMock: {
    detectedDocumentType: 'OTHER',
    documentCategory: 'AUTHORITY',
    documentSubtype: 'DRIVER_IDENTIFICATION_REQUEST',
    confidence: 0.87,
    rationale: 'Authority driver identification questionnaire with response deadline',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [{ identifierType: 'reference_number', value: 'AZ-2026-4412', evidencePage: 1 }],
  },
  extractionFields: DRIVER_IDENTIFICATION_REQUEST_COMPLETE,
  expectedFieldKeys: ['referenceNumber', 'responseDeadline', 'licensePlate'],
});

export const GOLDEN_DAMAGE: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-damage-001',
  label: 'Damage report',
  documentType: 'DAMAGE',
  expectedCategory: 'INSURANCE',
  expectedSubtype: 'DAMAGE_REPORT',
  ocrText: `Schadensmeldung — SynqDrive Demo GmbH
Datum: 01.02.2026
Beschreibung: Lackschaden hintere linke Tür
Schadensbereich: Tür HL | Schwere: moderat
Fahrbereit: ja | Dritte beteiligt: nein`,
  classificationMock: {
    detectedDocumentType: 'DAMAGE',
    documentCategory: 'INSURANCE',
    documentSubtype: 'DAMAGE_REPORT',
    confidence: 0.9,
    rationale: 'Structured vehicle damage report',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [],
  },
  extractionFields: DAMAGE_COMPLETE,
  expectedFieldKeys: ['eventDate', 'damageDescription', 'damageAreas'],
});

export const GOLDEN_ACCIDENT: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-accident-001',
  label: 'Accident report',
  documentType: 'ACCIDENT',
  expectedCategory: 'INSURANCE',
  expectedSubtype: 'ACCIDENT_REPORT',
  ocrText: `Unfallbericht — SynqDrive Demo GmbH
Datum: 05.01.2026
Unfallhergang: Auffahrunfall Kreuzung — Heckschaden
Polizei: POL-2026-00123 | Versicherung: INS-CLAIM-9988
Dritte beteiligt: ja | Fahrbereit: nein`,
  classificationMock: {
    detectedDocumentType: 'ACCIDENT',
    documentCategory: 'INSURANCE',
    documentSubtype: 'ACCIDENT_REPORT',
    confidence: 0.92,
    rationale: 'Accident report with police and insurance references',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [{ identifierType: 'reference_number', value: 'POL-2026-00123', evidencePage: 1 }],
  },
  extractionFields: ACCIDENT_COMPLETE,
  expectedFieldKeys: ['eventDate', 'damageDescription', 'policeReference'],
});

export const GOLDEN_INSURANCE_LETTER: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-insurance-letter-001',
  label: 'Insurance letter',
  documentType: 'OTHER',
  expectedCategory: 'INSURANCE',
  expectedSubtype: 'INSURANCE_LETTER',
  ocrText: `Versicherungsschreiben — Allianz Demo AG
Aktenzeichen: SCH-2026-7781
Datum: 18.03.2026
Betreff: Schadenmeldung — Rückfrage Unterlagen
Bitte Fotos und Kostenvoranschlag bis 01.04.2026 einreichen.`,
  classificationMock: {
    detectedDocumentType: 'OTHER',
    documentCategory: 'INSURANCE',
    documentSubtype: 'INSURANCE_LETTER',
    confidence: 0.84,
    rationale: 'Insurance correspondence requesting claim documents',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [{ identifierType: 'reference_number', value: 'SCH-2026-7781', evidencePage: 1 }],
  },
  extractionFields: INSURANCE_LETTER,
  expectedFieldKeys: ['referenceNumber', 'subject', 'summary'],
});

export const GOLDEN_GENERAL_LETTER: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-general-letter-001',
  label: 'General customer letter',
  documentType: 'OTHER',
  expectedCategory: 'CUSTOMER',
  expectedSubtype: 'CUSTOMER_CORRESPONDENCE',
  ocrText: `Kundenkorrespondenz — SynqDrive Demo GmbH
Ticket: TICK-8821 | Datum: 22.03.2026
Betreff: Anfrage zu Buchung BK-2026-0142
Kunde bittet um Kulanzprüfung bei verspäteter Rückgabe.`,
  classificationMock: {
    detectedDocumentType: 'OTHER',
    documentCategory: 'CUSTOMER',
    documentSubtype: 'CUSTOMER_CORRESPONDENCE',
    confidence: 0.79,
    rationale: 'Customer correspondence without invoice or fine structure',
    sourcePages: [1],
    alternatives: [
      {
        documentCategory: 'GENERAL',
        documentSubtype: 'OTHER',
        confidence: 0.45,
        rationale: 'Generic letter layout',
      },
    ],
    detectedIdentifiers: [{ identifierType: 'reference_number', value: 'TICK-8821', evidencePage: 1 }],
  },
  extractionFields: CUSTOMER_CORRESPONDENCE,
  expectedFieldKeys: ['referenceNumber', 'subject', 'summary'],
});

export const GOLDEN_UNKNOWN: DocumentIntakeGoldenCase = defineGoldenCase({
  id: 'golden-unknown-001',
  label: 'Unknown document',
  documentType: 'OTHER',
  expectedCategory: 'GENERAL',
  expectedSubtype: 'OTHER',
  ocrText: `Unklares Dokument — SynqDrive Demo GmbH
fragmentarischer Text
Seite 1: Symboltabelle ohne erkennbare Struktur
---`,
  classificationMock: {
    detectedDocumentType: CLASSIFICATION_UNKNOWN,
    documentCategory: 'GENERAL',
    documentSubtype: 'OTHER',
    confidence: 0.32,
    rationale: 'unclear document structure — insufficient signals',
    sourcePages: [1],
    alternatives: [],
    detectedIdentifiers: [],
  },
  extractionFields: {
    summary: 'Dokumentart unklar — manuelle Klassifikation erforderlich.',
    archiveSubtype: 'UNKNOWN',
  },
  expectedFieldKeys: ['summary'],
  reviewNotes: ['Manual classification required'],
});

export const DOCUMENT_INTAKE_GOLDEN_CORPUS: readonly DocumentIntakeGoldenCase[] = [
  GOLDEN_SERVICE,
  GOLDEN_TIRE,
  GOLDEN_BRAKE,
  GOLDEN_BATTERY,
  GOLDEN_TUV,
  GOLDEN_BOKRAFT,
  GOLDEN_INVOICE_19,
  GOLDEN_INVOICE_7,
  GOLDEN_INVOICE_TAX_FREE,
  GOLDEN_INVOICE_MULTI_RATE,
  GOLDEN_CREDIT_NOTE,
  GOLDEN_REMINDER,
  GOLDEN_FINE,
  GOLDEN_DRIVER_IDENTIFICATION,
  GOLDEN_DAMAGE,
  GOLDEN_ACCIDENT,
  GOLDEN_INSURANCE_LETTER,
  GOLDEN_GENERAL_LETTER,
  GOLDEN_UNKNOWN,
] as const;

export const GOLDEN_CORPUS_BY_ID: Readonly<Record<string, DocumentIntakeGoldenCase>> = Object.fromEntries(
  DOCUMENT_INTAKE_GOLDEN_CORPUS.map((entry) => [entry.id, entry]),
);

export { DOCUMENT_INTAKE_GOLDEN_CORPUS_VERSION };
