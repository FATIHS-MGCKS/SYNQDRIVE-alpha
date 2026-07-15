import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';

export const OUTGOING_TYPES: OrgInvoiceType[] = [
  'OUTGOING_BOOKING',
  'OUTGOING_MANUAL',
  'OUTGOING_FINAL',
];

export const INCOMING_TYPES: OrgInvoiceType[] = ['INCOMING_VENDOR', 'INCOMING_UPLOADED'];

export function isOutgoingInvoiceType(type: OrgInvoiceType | string): boolean {
  return OUTGOING_TYPES.includes(type as OrgInvoiceType);
}

export function isIncomingInvoiceType(type: OrgInvoiceType | string): boolean {
  return INCOMING_TYPES.includes(type as OrgInvoiceType);
}

/** Statuses that must not count as open receivables/payables. */
export const NON_OPEN_OUTGOING_STATUSES: OrgInvoiceStatus[] = [
  'DRAFT',
  'CANCELLED',
  'VOID',
  'CREDITED',
];

export const NON_OPEN_INCOMING_STATUSES: OrgInvoiceStatus[] = [
  'DRAFT',
  'CANCELLED',
  'VOID',
  'REJECTED',
  'UPLOADED',
  'NEEDS_REVIEW',
];

export const REVENUE_EXCLUDED_STATUSES: OrgInvoiceStatus[] = ['DRAFT', 'CANCELLED', 'VOID', 'CREDITED'];

export const EXPENSE_EXCLUDED_STATUSES: OrgInvoiceStatus[] = ['DRAFT', 'CANCELLED', 'VOID', 'REJECTED'];

export function defaultStatusForCreate(
  type: OrgInvoiceType,
  fromExtraction: boolean,
): OrgInvoiceStatus {
  if (isOutgoingInvoiceType(type)) return 'DRAFT';
  if (fromExtraction) return 'NEEDS_REVIEW';
  return 'NEEDS_REVIEW';
}

export function derivePaymentStatus(
  paidCents: number,
  totalCents: number,
  current: OrgInvoiceStatus,
  isOutgoing: boolean,
): OrgInvoiceStatus {
  if (['CANCELLED', 'VOID', 'CREDITED', 'REJECTED'].includes(current)) return current;
  if (paidCents <= 0) return current;
  if (paidCents >= totalCents) return 'PAID';
  return 'PARTIALLY_PAID';
}

export function isEditableStatus(status: OrgInvoiceStatus): boolean {
  return ['DRAFT', 'NEEDS_REVIEW', 'UPLOADED', 'APPROVED'].includes(status);
}

export function canRecordPayment(status: OrgInvoiceStatus): boolean {
  return !['CANCELLED', 'VOID', 'CREDITED', 'REJECTED'].includes(status);
}

/** Whether an invoice may be cancelled/rejected via the cancel endpoint. */
export function canCancelInvoice(
  status: OrgInvoiceStatus,
  paidCents: number,
  totalCents: number,
): boolean {
  if (['CANCELLED', 'VOID', 'CREDITED', 'REJECTED', 'PAID'].includes(status)) return false;
  if (totalCents > 0 && paidCents >= totalCents) return false;
  return true;
}

export function displayInvoiceNumber(inv: {
  invoiceNumberDisplay?: string | null;
  legacyInvoiceNumber?: number | null;
  invoiceNumber?: number | null;
  sequenceYear?: number | null;
  sequenceNumber?: number | null;
  status?: OrgInvoiceStatus | string;
}): string {
  if (inv.invoiceNumberDisplay) return inv.invoiceNumberDisplay;
  if (inv.sequenceYear != null && inv.sequenceNumber != null) {
    return `${inv.sequenceYear}-${String(inv.sequenceNumber).padStart(4, '0')}`;
  }
  const legacy = inv.legacyInvoiceNumber ?? inv.invoiceNumber;
  if (legacy != null) return `#${legacy}`;
  if (inv.status === 'DRAFT' || inv.status === 'NEEDS_REVIEW' || inv.status === 'UPLOADED') {
    return 'Entwurf';
  }
  return '—';
}
