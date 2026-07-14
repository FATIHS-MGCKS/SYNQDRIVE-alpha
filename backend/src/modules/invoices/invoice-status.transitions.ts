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
  issuedAt?: Date | null;
  sentAt?: Date;
}

export type ValidateExternalMarkSentResult =
  | { ok: true; sentAt: Date }
  | { ok: false; message: string };

const MAX_FUTURE_SENT_AT_MS = 5 * 60 * 1000;

/**
 * Validates whether an external send may be recorded and promotes invoice sentAt.
 */
export function validateRecordExternalSend(
  input: ValidateExternalMarkSentInput,
): ValidateExternalMarkSentResult {
  if (!isOutgoingInvoiceType(input.type)) {
    return { ok: false, message: 'Only outgoing invoices can be recorded as sent externally' };
  }
  if (!EXTERNAL_MARK_SENT_SOURCE_STATUSES.includes(input.status)) {
    return {
      ok: false,
      message: 'Invoice must be issued before recording external delivery',
    };
  }
  if (!input.sequenceNumber) {
    return {
      ok: false,
      message: 'Issue the invoice before recording external delivery',
    };
  }

  const sentAt = input.sentAt ?? new Date();
  const now = Date.now();
  if (sentAt.getTime() > now + MAX_FUTURE_SENT_AT_MS) {
    return { ok: false, message: 'sentAt cannot be in the future' };
  }
  if (input.issuedAt && sentAt.getTime() < input.issuedAt.getTime()) {
    return { ok: false, message: 'sentAt cannot be before invoice issue date' };
  }

  return { ok: true, sentAt };
}

/**
 * @deprecated Use validateRecordExternalSend — kept for legacy mark-sent compat.
 */
export function validateExternalMarkSent(
  input: ValidateExternalMarkSentInput,
): ValidateExternalMarkSentResult {
  return validateRecordExternalSend({ ...input, sentAt: input.sentAt ?? new Date() });
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
