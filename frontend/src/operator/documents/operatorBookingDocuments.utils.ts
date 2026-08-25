import type { BookingDocumentBundleView, GeneratedDocumentDto } from '../../lib/api';

export type OperatorDocumentAvailability = 'available' | 'missing' | 'generating' | 'failed';

export type OperatorBookingDocumentGroupKey =
  | 'contractTerms'
  | 'pickup'
  | 'return'
  | 'invoiceDeposit';

export interface OperatorDocumentSlot {
  documentType: string;
  dynamicTitle?: string;
  doc: GeneratedDocumentDto | null;
  availability: OperatorDocumentAvailability;
}

export const OPERATOR_BOOKING_DOCUMENT_GROUPS: {
  groupKey: OperatorBookingDocumentGroupKey;
  types: string[];
}[] = [
  {
    groupKey: 'contractTerms',
    types: ['RENTAL_CONTRACT', 'TERMS_AND_CONDITIONS', 'WITHDRAWAL_INFORMATION', 'PRIVACY_POLICY'],
  },
  {
    groupKey: 'pickup',
    types: ['HANDOVER_PICKUP'],
  },
  {
    groupKey: 'return',
    types: ['HANDOVER_RETURN', 'FINAL_INVOICE'],
  },
  {
    groupKey: 'invoiceDeposit',
    types: ['BOOKING_INVOICE', 'DEPOSIT_RECEIPT'],
  },
];

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
        dynamicTitle: doc.title ?? undefined,
        doc,
        availability: deriveDocumentAvailability(doc.documentType, doc, bundle),
      });
    }
  }

  return slots;
}
