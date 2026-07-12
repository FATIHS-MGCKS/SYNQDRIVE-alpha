import type { BookingDocumentBundleView, GeneratedDocumentDto } from '../../lib/api';

export type OperatorDocumentAvailability = 'available' | 'missing' | 'generating' | 'failed';

export interface OperatorDocumentSlot {
  documentType: string;
  label: string;
  doc: GeneratedDocumentDto | null;
  availability: OperatorDocumentAvailability;
}

export const OPERATOR_BOOKING_DOCUMENT_GROUPS: { groupLabel: string; types: string[] }[] = [
  {
    groupLabel: 'Vertrag & Bedingungen',
    types: ['RENTAL_CONTRACT', 'TERMS_AND_CONDITIONS', 'WITHDRAWAL_INFORMATION', 'PRIVACY_POLICY'],
  },
  {
    groupLabel: 'Abholung',
    types: ['HANDOVER_PICKUP'],
  },
  {
    groupLabel: 'Rückgabe',
    types: ['HANDOVER_RETURN', 'FINAL_INVOICE'],
  },
  {
    groupLabel: 'Rechnung & Kaution',
    types: ['BOOKING_INVOICE', 'DEPOSIT_RECEIPT'],
  },
];

export const OPERATOR_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  BOOKING_INVOICE: 'Buchungsrechnung',
  DEPOSIT_RECEIPT: 'Kautionsbeleg',
  RENTAL_CONTRACT: 'Mietvertrag',
  TERMS_AND_CONDITIONS: 'AGB',
  WITHDRAWAL_INFORMATION: 'Widerrufsbelehrung',
  PRIVACY_POLICY: 'Datenschutzerklärung',
  HANDOVER_PICKUP: 'Pickup-Protokoll',
  HANDOVER_RETURN: 'Return-Protokoll',
  FINAL_INVOICE: 'Schlussrechnung',
};

export const OPERATOR_DOCUMENT_AVAILABILITY_LABELS: Record<OperatorDocumentAvailability, string> = {
  available: 'Verfügbar',
  missing: 'Fehlt',
  generating: 'Wird generiert',
  failed: 'Fehlerhaft',
};

export function currentDocumentsByType(
  documents: GeneratedDocumentDto[] | undefined,
): Record<string, GeneratedDocumentDto> {
  const map: Record<string, GeneratedDocumentDto> = {};
  const sorted = [...(documents ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const doc of sorted) {
    if (doc.status === 'VOID') continue;
    map[doc.documentType] = doc;
  }
  return map;
}

export function deriveDocumentAvailability(
  documentType: string,
  doc: GeneratedDocumentDto | null,
  bundle: BookingDocumentBundleView['bundle'] | null,
): OperatorDocumentAvailability {
  if (doc) {
    if (doc.status === 'FAILED' || doc.status === 'ERROR') return 'failed';
    return 'available';
  }
  if (bundle?.status === 'FAILED' && bundle.lastError) return 'failed';
  if (bundle?.status === 'PENDING') return 'generating';
  return 'missing';
}

export function buildOperatorDocumentSlots(
  view: BookingDocumentBundleView | null,
): OperatorDocumentSlot[] {
  const byType = currentDocumentsByType(view?.documents);
  const bundle = view?.bundle ?? null;
  const slots: OperatorDocumentSlot[] = [];

  for (const group of OPERATOR_BOOKING_DOCUMENT_GROUPS) {
    for (const documentType of group.types) {
      const doc = byType[documentType] ?? null;
      slots.push({
        documentType,
        label: OPERATOR_DOCUMENT_TYPE_LABELS[documentType] ?? documentType,
        doc,
        availability: deriveDocumentAvailability(documentType, doc, bundle),
      });
    }
  }

  for (const doc of Object.values(byType)) {
    if (slots.some((s) => s.documentType === doc.documentType)) continue;
    if (doc.documentType.toUpperCase().includes('DAMAGE') || doc.title?.toLowerCase().includes('schaden')) {
      slots.push({
        documentType: doc.documentType,
        label: doc.title || 'Schadensbericht',
        doc,
        availability: deriveDocumentAvailability(doc.documentType, doc, bundle),
      });
    }
  }

  return slots;
}

export const OPERATOR_CUSTOMER_DOCUMENT_LABELS: Record<string, string> = {
  ID_FRONT: 'Ausweis (Vorderseite)',
  ID_BACK: 'Ausweis (Rückseite)',
  LICENSE_FRONT: 'Führerschein (Vorderseite)',
  LICENSE_BACK: 'Führerschein (Rückseite)',
};

export function formatOperatorDocumentMeta(doc: GeneratedDocumentDto): string {
  return [
    doc.documentNumber || doc.fileName,
    doc.legalVersionLabel ? `v${doc.legalVersionLabel}` : null,
    doc.generatedAt || doc.createdAt
      ? new Date(doc.generatedAt || doc.createdAt).toLocaleDateString('de-DE')
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
