import { BookingStatus } from '@prisma/client';

/** Marker in `Booking.notes` for ephemeral checkout wizard drafts. */
export const WIZARD_DRAFT_MARKER = '[synq:wizard-draft]';

export function isWizardDraftBooking(booking: {
  status: BookingStatus | string;
  notes?: string | null;
}): boolean {
  return booking.status === 'PENDING' && (booking.notes?.includes(WIZARD_DRAFT_MARKER) ?? false);
}

export function mergeWizardDraftNotes(userNotes?: string | null): string {
  const base = userNotes?.trim() ?? '';
  if (base.includes(WIZARD_DRAFT_MARKER)) return base;
  return base ? `${WIZARD_DRAFT_MARKER} ${base}` : WIZARD_DRAFT_MARKER;
}

export function stripWizardDraftMarker(notes?: string | null): string {
  return (notes ?? '').replace(WIZARD_DRAFT_MARKER, '').trim();
}
