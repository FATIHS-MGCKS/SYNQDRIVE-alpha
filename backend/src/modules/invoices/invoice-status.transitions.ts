import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { isOutgoingInvoiceType } from './invoice-domain.util';

/**
 * How an outgoing invoice may reach status SENT.
 * Invoice business status and outbound communication status are separate truths.
 */
export enum InvoiceSentSource {
  /** User marks invoice sent outside SynqDrive (POST mark-sent). */
  EXTERNAL_MANUAL = 'EXTERNAL_MANUAL',
  /** Reserved — email success does NOT auto-promote invoice to SENT. */
  EMAIL_PROVIDER_ACCEPTED = 'EMAIL_PROVIDER_ACCEPTED',
}

export class InvoiceStatusTransitionError extends Error {
  constructor(
    public readonly from: OrgInvoiceStatus,
    public readonly to: OrgInvoiceStatus,
    message?: string,
  ) {
    super(message ?? `Invalid invoice status transition: ${from} → ${to}`);
    this.name = 'InvoiceStatusTransitionError';
  }
}

const OUTGOING_TRANSITIONS: Readonly<Record<OrgInvoiceStatus, readonly OrgInvoiceStatus[]>> = {
  DRAFT: ['ISSUED', 'CANCELLED', 'VOID'],
  ISSUED: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID', 'CREDITED'],
  SENT: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID', 'CREDITED'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE', 'SENT', 'CANCELLED', 'VOID', 'CREDITED'],
  PAID: ['CREDITED', 'VOID'],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'SENT', 'CANCELLED', 'VOID', 'CREDITED'],
  CANCELLED: [],
  CREDITED: [],
  VOID: [],
  UPLOADED: [],
  NEEDS_REVIEW: [],
  APPROVED: [],
  BOOKED: [],
  REJECTED: [],
};

/** Statuses allowed as source for external mark-sent (backward compatible). */
export const EXTERNAL_MARK_SENT_SOURCE_STATUSES: OrgInvoiceStatus[] = [
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
  'OVERDUE',
];

export function canTransitionInvoiceStatus(
  from: OrgInvoiceStatus,
  to: OrgInvoiceStatus,
): boolean {
  return (OUTGOING_TRANSITIONS[from] ?? []).includes(to);
}

export function assertInvoiceStatusTransition(
  from: OrgInvoiceStatus,
  to: OrgInvoiceStatus,
): void {
  if (!canTransitionInvoiceStatus(from, to)) {
    throw new InvoiceStatusTransitionError(from, to);
  }
}

export interface ValidateExternalMarkSentInput {
  type: OrgInvoiceType | string;
  status: OrgInvoiceStatus;
  sequenceNumber: number | null;
}

export type ValidateExternalMarkSentResult =
  | { ok: true; sentAt: Date }
  | { ok: false; message: string };

/**
 * External/manual mark-sent — does not require or imply outbound email success.
 */
export function validateExternalMarkSent(
  input: ValidateExternalMarkSentInput,
): ValidateExternalMarkSentResult {
  if (!isOutgoingInvoiceType(input.type)) {
    return { ok: false, message: 'Only outgoing invoices can be marked as sent' };
  }
  if (!EXTERNAL_MARK_SENT_SOURCE_STATUSES.includes(input.status)) {
    return {
      ok: false,
      message: 'Invoice must be issued before marking as sent',
    };
  }
  if (!input.sequenceNumber) {
    return {
      ok: false,
      message: 'Issue the invoice before marking as sent',
    };
  }
  return { ok: true, sentAt: new Date() };
}

/**
 * Email provider acceptance must NOT promote invoice to SENT.
 * Communication audit lives on OutboundEmail; invoice stays ISSUED until manual mark or payment flow.
 */
export function shouldPromoteInvoiceToSentOnEmailSuccess(): boolean {
  return false;
}

/**
 * Delivery webhook (DELIVERED) must NOT change invoice business status.
 */
export function shouldUpdateInvoiceOnEmailDelivery(): boolean {
  return false;
}

/**
 * Bounce after invoice was externally marked SENT: invoice status unchanged; outbound row shows BOUNCE.
 */
export function shouldRevertInvoiceSentOnEmailBounce(): boolean {
  return false;
}

export function isInvoiceIssued(input: {
  status: OrgInvoiceStatus;
  sequenceNumber: number | null;
  issuedAt?: Date | null;
}): boolean {
  if (input.status === 'DRAFT') return false;
  if (input.sequenceNumber != null) return true;
  return input.status === 'ISSUED' && input.issuedAt != null;
}
