import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import {
  DOCUMENT_GENERATION_STATUS,
  isEmailSendableDocumentStatus,
} from '@modules/documents/documents.constants';
import { isIncomingInvoiceType, isOutgoingInvoiceType } from './invoice-domain.util';
import type { InvoiceDocumentsViewDto } from './invoice-document-read.types';

const OUTGOING_EMAIL_BLOCKED_STATUSES: OrgInvoiceStatus[] = [
  'DRAFT',
  'CANCELLED',
  'VOID',
  'CREDITED',
];

export type InvoiceSendValidationInput = {
  type: OrgInvoiceType;
  status: OrgInvoiceStatus;
  sequenceNumber: number | null;
  customerEmail: string | null;
  explicitRecipient?: string | null;
  documentsView: InvoiceDocumentsViewDto;
  documentId?: string | null;
};

export type InvoiceSendValidationResult =
  | { ok: true; documentId: string }
  | { ok: false; code: string; message: string };

export function resolveInvoiceEmailRecipient(
  explicitRecipient: string | null | undefined,
  customerEmail: string | null | undefined,
): string | null {
  const explicit = explicitRecipient?.trim();
  if (explicit) return explicit;
  const customer = customerEmail?.trim();
  return customer || null;
}

export function validateInvoiceEmailSend(
  input: InvoiceSendValidationInput,
): InvoiceSendValidationResult {
  if (isIncomingInvoiceType(input.type)) {
    return {
      ok: false,
      code: 'INCOMING_NOT_SENDABLE',
      message: 'Eingangsrechnungen können nicht per E-Mail versendet werden',
    };
  }

  if (!isOutgoingInvoiceType(input.type)) {
    return {
      ok: false,
      code: 'INVALID_TYPE',
      message: 'Rechnungstyp unterstützt keinen E-Mail-Versand',
    };
  }

  if (OUTGOING_EMAIL_BLOCKED_STATUSES.includes(input.status)) {
    return {
      ok: false,
      code: 'INVALID_STATUS',
      message: `Rechnung im Status ${input.status} kann nicht versendet werden`,
    };
  }

  if (input.status !== 'DRAFT' && input.sequenceNumber == null) {
    return {
      ok: false,
      code: 'NOT_ISSUED',
      message: 'Rechnung muss zuerst ausgestellt werden',
    };
  }

  const recipient = resolveInvoiceEmailRecipient(
    input.explicitRecipient,
    input.customerEmail,
  );
  if (!recipient) {
    return {
      ok: false,
      code: 'NO_RECIPIENT',
      message: 'Kein Empfänger — Kunden-E-Mail oder explizite Adresse erforderlich',
    };
  }

  const targetDocumentId =
    input.documentId?.trim() || input.documentsView.activeDocumentId;
  if (!targetDocumentId) {
    const genStatus = input.documentsView.documents.some(
      (d) =>
        d.lifecycle === 'GENERATING' ||
        d.generationStatus === DOCUMENT_GENERATION_STATUS.PROCESSING ||
        d.generationStatus === DOCUMENT_GENERATION_STATUS.PENDING,
    );
    if (genStatus) {
      return {
        ok: false,
        code: 'PDF_GENERATING',
        message: 'Rechnungs-PDF wird noch erstellt',
      };
    }
    const failed = input.documentsView.documents.some((d) => d.lifecycle === 'FAILED');
    if (failed) {
      return {
        ok: false,
        code: 'PDF_GENERATION_FAILED',
        message: 'Dokumentgenerierung fehlgeschlagen',
      };
    }
    return {
      ok: false,
      code: 'NO_ACTIVE_PDF',
      message: 'Kein aktives Rechnungs-PDF verfügbar',
    };
  }

  const doc = input.documentsView.documents.find((d) => d.id === targetDocumentId);
  if (!doc) {
    return {
      ok: false,
      code: 'DOCUMENT_NOT_FOUND',
      message: 'Angegebenes Dokument gehört nicht zu dieser Rechnung',
    };
  }

  if (
    doc.lifecycle === 'GENERATING' ||
    doc.generationStatus === DOCUMENT_GENERATION_STATUS.PROCESSING ||
    doc.generationStatus === DOCUMENT_GENERATION_STATUS.PENDING
  ) {
    return {
      ok: false,
      code: 'PDF_GENERATING',
      message: 'Rechnungs-PDF wird noch erstellt',
    };
  }

  if (doc.lifecycle === 'FAILED') {
    return {
      ok: false,
      code: 'PDF_GENERATION_FAILED',
      message: 'Dokumentgenerierung fehlgeschlagen',
    };
  }

  if (!doc.downloadAvailable) {
    return {
      ok: false,
      code: 'PDF_UNAVAILABLE',
      message: 'Rechnungs-PDF ist nicht verfügbar',
    };
  }

  if (!isEmailSendableDocumentStatus(doc.status)) {
    return {
      ok: false,
      code: 'DOCUMENT_NOT_SENDABLE',
      message: `Dokument im Status ${doc.status} kann nicht versendet werden`,
    };
  }

  return { ok: true, documentId: targetDocumentId };
}
