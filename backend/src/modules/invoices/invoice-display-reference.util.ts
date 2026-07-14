import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { bookingNumberFromId } from './invoice-detail-relations.util';
import { displayInvoiceNumber } from './invoice-domain.util';

export type InvoiceReferenceInput = {
  invoiceNumberDisplay?: string | null;
  legacyInvoiceNumber?: number | null;
  invoiceNumber?: number | null;
  sequenceYear?: number | null;
  sequenceNumber?: number | null;
  status?: OrgInvoiceStatus | string;
  bookingId?: string | null;
  type?: OrgInvoiceType | string;
  title?: string | null;
  vendorName?: string | null;
};

const UUID_FRAGMENT_RE = /#[0-9a-f]{8}\b/i;
const TITLE_SEPARATOR = ' · ';

/** Whether a stored title still embeds a legacy UUID fragment (e.g. `#d8e9f0a1`). */
export function titleContainsUuidFragment(title: string | null | undefined): boolean {
  if (!title) return false;
  return UUID_FRAGMENT_RE.test(title);
}

/** True when the invoice has an allocated public number (issued or legacy). */
export function hasPublicInvoiceNumber(input: InvoiceReferenceInput): boolean {
  const label = displayInvoiceNumber(input);
  return label !== 'Entwurf' && label !== '—';
}

/**
 * Public reference for tasks, notifications, and descriptions.
 * Prefers invoice number; before issue uses booking number when linked.
 */
export function resolveInvoicePublicReference(input: InvoiceReferenceInput): string {
  if (hasPublicInvoiceNumber(input)) {
    return displayInvoiceNumber(input);
  }
  if (input.bookingId) {
    return bookingNumberFromId(input.bookingId);
  }
  const cleaned = stripUuidFragmentsFromTitle(input.title);
  if (cleaned) return cleaned;
  if (input.vendorName?.trim()) return input.vendorName.trim();
  return neutralInvoiceTypeLabel(input.type);
}

function neutralInvoiceTypeLabel(type?: OrgInvoiceType | string): string {
  switch (type) {
    case 'OUTGOING_BOOKING':
      return 'Buchungsrechnung';
    case 'OUTGOING_FINAL':
      return 'Schlussrechnung';
    case 'OUTGOING_MANUAL':
      return 'Manuelle Rechnung';
    case 'INCOMING_VENDOR':
    case 'INCOMING_UPLOADED':
      return 'Eingangsrechnung';
    default:
      return 'Rechnung';
  }
}

function stripUuidFragmentsFromTitle(title: string | null | undefined): string | null {
  if (!title?.trim()) return null;
  const cleaned = title.replace(UUID_FRAGMENT_RE, '').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function buildBookingInvoiceTitle(args: {
  bookingId: string;
  invoiceNumberDisplay?: string | null;
  sequenceYear?: number | null;
  sequenceNumber?: number | null;
  legacyInvoiceNumber?: number | null;
  invoiceNumber?: number | null;
  status?: OrgInvoiceStatus | string;
}): string {
  const ref = resolveInvoicePublicReference({
    ...args,
    type: 'OUTGOING_BOOKING',
  });
  return `Buchungsrechnung${TITLE_SEPARATOR}${ref}`;
}

export function buildFinalInvoiceTitle(args: {
  bookingId: string;
  invoiceNumberDisplay?: string | null;
  sequenceYear?: number | null;
  sequenceNumber?: number | null;
  legacyInvoiceNumber?: number | null;
  invoiceNumber?: number | null;
  status?: OrgInvoiceStatus | string;
}): string {
  const ref = resolveInvoicePublicReference({
    ...args,
    type: 'OUTGOING_FINAL',
  });
  return `Schlussrechnung${TITLE_SEPARATOR}${ref}`;
}

export function buildFinalInvoiceDescription(args: {
  bookingId: string;
  originalInvoiceId?: string | null;
  originalInvoiceNumberDisplay?: string | null;
  originalSequenceYear?: number | null;
  originalSequenceNumber?: number | null;
}): string | undefined {
  if (!args.originalInvoiceId) return undefined;
  const originalRef = resolveInvoicePublicReference({
    invoiceNumberDisplay: args.originalInvoiceNumberDisplay,
    sequenceYear: args.originalSequenceYear,
    sequenceNumber: args.originalSequenceNumber,
    bookingId: args.bookingId,
    type: 'OUTGOING_BOOKING',
  });
  return `Endabrechnung zur Buchung ${bookingNumberFromId(args.bookingId)} (Ausgangsrechnung ${originalRef})`;
}

export function buildUnpaidOutgoingTaskTitle(input: InvoiceReferenceInput): string {
  if (hasPublicInvoiceNumber(input)) {
    return `Zahlungseingang prüfen${TITLE_SEPARATOR}Rechnung ${displayInvoiceNumber(input)}`;
  }
  if (input.bookingId) {
    return `Zahlungseingang prüfen${TITLE_SEPARATOR}Buchung ${bookingNumberFromId(input.bookingId)}`;
  }
  const ref = resolveInvoicePublicReference(input);
  return `Zahlungseingang prüfen${TITLE_SEPARATOR}${ref}`;
}

export function buildUnpaidIncomingTaskTitle(input: InvoiceReferenceInput): string {
  if (hasPublicInvoiceNumber(input)) {
    return `Eingangsrechnung bezahlen${TITLE_SEPARATOR}Rechnung ${displayInvoiceNumber(input)}`;
  }
  const ref = resolveInvoicePublicReference(input);
  return `Eingangsrechnung bezahlen${TITLE_SEPARATOR}${ref}`;
}

export function buildUnpaidTaskDescription(
  input: InvoiceReferenceInput,
  totalCents: number,
  currency: string,
): string {
  const ref = resolveInvoicePublicReference(input);
  return `Rechnung ${ref} (${(totalCents / 100).toFixed(2)} ${currency}) ist noch unbezahlt.`;
}

/** Document / PDF title suffix for booking-linked docs (no UUID fragments). */
export function buildBookingDocumentTitleSuffix(bookingId: string): string {
  return bookingNumberFromId(bookingId);
}

export function buildBookingDocumentFileSlug(bookingId: string): string {
  return bookingNumberFromId(bookingId).toLowerCase();
}
