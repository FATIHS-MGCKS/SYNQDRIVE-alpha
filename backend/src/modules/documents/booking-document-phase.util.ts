import { DOCUMENT_TYPE, type DocumentType } from './documents.constants';

/** Process phases for booking document package tasks (one DOCUMENT_REVIEW per phase). */
export type BookingDocumentPhase = 'CONFIRMED' | 'ACTIVE' | 'COMPLETED';

/** Document types required in each phase (delta per phase — not cumulative). */
export const DOCUMENT_PHASE_REQUIREMENTS: Record<BookingDocumentPhase, DocumentType[]> = {
  CONFIRMED: [
    DOCUMENT_TYPE.BOOKING_INVOICE,
    DOCUMENT_TYPE.DEPOSIT_RECEIPT,
    DOCUMENT_TYPE.RENTAL_CONTRACT,
    DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
    DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
  ],
  ACTIVE: [DOCUMENT_TYPE.HANDOVER_PICKUP],
  COMPLETED: [DOCUMENT_TYPE.HANDOVER_RETURN, DOCUMENT_TYPE.FINAL_INVOICE],
};

export function documentPhaseForBookingStatus(status: string): BookingDocumentPhase | null {
  if (status === 'CONFIRMED' || status === 'PENDING') return 'CONFIRMED';
  if (status === 'ACTIVE') return 'ACTIVE';
  if (status === 'COMPLETED') return 'COMPLETED';
  return null;
}

/** Phases that should be evaluated while the booking is in the given status. */
export function applicableDocumentPhases(status: string): BookingDocumentPhase[] {
  if (status === 'CONFIRMED' || status === 'PENDING') return ['CONFIRMED'];
  if (status === 'ACTIVE') return ['CONFIRMED', 'ACTIVE'];
  if (status === 'COMPLETED') return ['CONFIRMED', 'ACTIVE', 'COMPLETED'];
  return [];
}

export function bookingDocumentPackageDedupKey(
  phase: BookingDocumentPhase,
  bookingId: string,
): string {
  return `document:package:${phase}:${bookingId}`;
}

export function isLegacyPerTypeDocumentDedupKey(dedupKey: string | null | undefined): boolean {
  if (!dedupKey) return false;
  if (dedupKey.startsWith('document:package:')) return false;
  return /^document:[^:]+:/.test(dedupKey);
}
