import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { DOCUMENT_GENERATION_STATUS } from '@modules/documents/documents.constants';
import {
  canRecordPayment,
  isEditableStatus,
  isOutgoingInvoiceType,
} from './invoice-domain.util';
import type {
  InvoiceDetailCapabilitiesDto,
  InvoiceDocumentGenerationAggregateStatus,
} from './invoice-detail.types';
import type { InvoiceDocumentsViewDto } from './invoice-document-read.types';

export interface InvoiceCapabilitiesInput {
  type: OrgInvoiceType;
  status: OrgInvoiceStatus;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  sequenceNumber: number | null;
  bookingId: string | null;
  customerEmail: string | null;
  documentsView: InvoiceDocumentsViewDto;
}

export function deriveDocumentGenerationStatus(
  documentsView: InvoiceDocumentsViewDto,
): InvoiceDocumentGenerationAggregateStatus {
  const docs = documentsView.documents;
  if (docs.length === 0) return 'NOT_STARTED';

  const hasProcessing = docs.some(
    (d) =>
      d.lifecycle === 'GENERATING' ||
      d.generationStatus === DOCUMENT_GENERATION_STATUS.PROCESSING ||
      d.generationStatus === DOCUMENT_GENERATION_STATUS.PENDING,
  );
  if (hasProcessing) return 'PROCESSING';

  if (documentsView.activeDocumentId) return 'SUCCEEDED';

  const hasFailed = docs.some((d) => d.lifecycle === 'FAILED');
  if (hasFailed) return 'FAILED';

  return 'PARTIAL';
}

export function buildInvoiceDetailCapabilities(
  input: InvoiceCapabilitiesInput,
): InvoiceDetailCapabilitiesDto {
  const blocking = {
    edit: [] as string[],
    issue: [] as string[],
    send: [] as string[],
    cancel: [] as string[],
    recordPayment: [] as string[],
  };

  const outgoing = isOutgoingInvoiceType(input.type);
  const outstanding = Math.max(0, input.outstandingCents);
  const documentGenerationStatus = deriveDocumentGenerationStatus(input.documentsView);
  const activeDoc = input.documentsView.documents.find((d) => d.isActive);

  let canEdit = isEditableStatus(input.status);
  if (!canEdit) {
    blocking.edit.push(`Status ${input.status} ist nicht bearbeitbar`);
  }
  if (!outgoing && canEdit) {
    blocking.edit.push('Eingangsrechnungen nur im Prüf-/Entwurfsstatus bearbeitbar');
  }

  let canIssue = outgoing && input.status === 'DRAFT';
  if (!outgoing) {
    blocking.issue.push('Nur Ausgangsrechnungen können ausgestellt werden');
  } else if (input.status !== 'DRAFT') {
    blocking.issue.push('Nur Entwürfe können ausgestellt werden');
  } else if (input.sequenceNumber != null) {
    blocking.issue.push('Rechnungsnummer bereits vergeben');
    canIssue = false;
  } else if (input.totalCents <= 0) {
    blocking.issue.push('Rechnungsbetrag muss größer als 0 sein');
    canIssue = false;
  }

  let canSend = false;
  if (!outgoing) {
    blocking.send.push('Nur Ausgangsrechnungen können versendet werden');
  } else if (input.status === 'DRAFT') {
    blocking.send.push('Rechnung muss zuerst ausgestellt werden');
  } else if (!input.documentsView.activeDocumentId || !activeDoc?.downloadAvailable) {
    if (documentGenerationStatus === 'PROCESSING') {
      blocking.send.push('Rechnungs-PDF wird noch erstellt');
    } else if (documentGenerationStatus === 'FAILED') {
      blocking.send.push('Dokumentgenerierung fehlgeschlagen');
    } else {
      blocking.send.push('Kein versendbares PDF verfügbar');
    }
  } else {
    canSend = true;
  }

  let canRecordPaymentAction = canRecordPayment(input.status) && outstanding > 0;
  if (!canRecordPayment(input.status)) {
    blocking.recordPayment.push(`Zahlung für Status ${input.status} nicht möglich`);
    canRecordPaymentAction = false;
  } else if (outstanding <= 0) {
    blocking.recordPayment.push('Kein offener Betrag');
    canRecordPaymentAction = false;
  }

  let canCancel =
    outgoing &&
    ['DRAFT', 'ISSUED', 'SENT'].includes(input.status) &&
    input.paidCents <= 0;
  if (!outgoing) {
    blocking.cancel.push('Nur Ausgangsrechnungen können storniert werden');
    canCancel = false;
  } else if (!['DRAFT', 'ISSUED', 'SENT'].includes(input.status)) {
    blocking.cancel.push(`Status ${input.status} kann nicht storniert werden`);
    canCancel = false;
  } else if (input.paidCents > 0) {
    blocking.cancel.push('Bereits Zahlungen erfasst');
    canCancel = false;
  }

  const sendAvailability = canSend ? 'AVAILABLE' : 'UNAVAILABLE';
  const paymentAvailability =
    outstanding <= 0
      ? 'SETTLED'
      : canRecordPaymentAction
        ? 'AVAILABLE'
        : 'UNAVAILABLE';

  return {
    canEdit,
    canIssue,
    canSend,
    canCancel,
    canRecordPayment: canRecordPaymentAction,
    documentGenerationStatus,
    sendAvailability,
    paymentAvailability,
    blockingReasons: blocking,
  };
}
