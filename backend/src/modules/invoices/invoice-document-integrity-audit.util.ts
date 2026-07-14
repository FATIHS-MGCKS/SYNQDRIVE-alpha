import { DOCUMENT_STATUS, DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import type { OrgInvoiceType } from '@prisma/client';

/** Document types that represent tenant invoice PDFs. */
export const INVOICE_DOCUMENT_TYPES = [
  DOCUMENT_TYPE.BOOKING_INVOICE,
  DOCUMENT_TYPE.FINAL_INVOICE,
] as const;

export type InvoiceDocumentType = (typeof INVOICE_DOCUMENT_TYPES)[number];

export const INVOICE_TYPE_TO_DOCUMENT_TYPE: Partial<Record<OrgInvoiceType, InvoiceDocumentType>> = {
  OUTGOING_BOOKING: DOCUMENT_TYPE.BOOKING_INVOICE,
  OUTGOING_FINAL: DOCUMENT_TYPE.FINAL_INVOICE,
};

export const ACTIVE_DOCUMENT_STATUSES = new Set<string>([
  DOCUMENT_STATUS.DRAFT,
  DOCUMENT_STATUS.GENERATED,
  DOCUMENT_STATUS.SENT,
]);

export const INACTIVE_DOCUMENT_STATUSES = new Set<string>([
  DOCUMENT_STATUS.VOID,
  DOCUMENT_STATUS.FAILED,
]);

export function expectedDocumentTypeForInvoice(
  invoiceType: OrgInvoiceType,
): InvoiceDocumentType | null {
  return INVOICE_TYPE_TO_DOCUMENT_TYPE[invoiceType] ?? null;
}

export function isInvoiceDocumentType(documentType: string): documentType is InvoiceDocumentType {
  return (INVOICE_DOCUMENT_TYPES as readonly string[]).includes(documentType);
}

export function isActiveDocumentStatus(status: string): boolean {
  return !INACTIVE_DOCUMENT_STATUSES.has(status);
}

export function hasStorageKey(objectKey: string | null | undefined): boolean {
  return typeof objectKey === 'string' && objectKey.trim().length > 0;
}

export function bundleInvoicePointerField(
  documentType: string,
): 'bookingInvoiceDocumentId' | 'finalInvoiceDocumentId' | null {
  if (documentType === DOCUMENT_TYPE.BOOKING_INVOICE) return 'bookingInvoiceDocumentId';
  if (documentType === DOCUMENT_TYPE.FINAL_INVOICE) return 'finalInvoiceDocumentId';
  return null;
}
