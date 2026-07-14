import type {
  OutboundEmailDeliveryStatus,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import {
  communicationPhaseLabel,
  deriveOutboundCommunicationPhase,
} from '@modules/outbound-email/outbound-email-status.transitions';
import {
  isRetryableOutboundEmail,
  resolveDisplayTimestamp,
  sanitizeOutboundErrorMessage,
} from '@modules/outbound-email/outbound-email-audit.util';
import type { InvoiceEmailSendHistoryEntryDto } from './invoice-detail.types';

export type OutboundEmailHistoryRow = {
  id: string;
  invoiceId: string | null;
  sourceType: OutboundEmailSourceType;
  status: OutboundEmailStatus;
  deliveryStatus: OutboundEmailDeliveryStatus;
  toEmail: string;
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  provider: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  generatedDocumentId: string | null;
  documentVersionNumber: number | null;
  sentByUserId: string | null;
  idempotencyKey: string | null;
  correlationId: string | null;
  requestedAt: Date;
  acceptedAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  attachments: Array<{ generatedDocumentId: string | null }>;
  sentByUser?: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
};

function formatActor(user: OutboundEmailHistoryRow['sentByUser']): string | null {
  if (!user) return null;
  const person = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (person) return person;
  if (user.name?.trim()) return user.name.trim();
  return user.email;
}

function mapChannel(sourceType: OutboundEmailSourceType): string {
  switch (sourceType) {
    case 'INVOICE_SINGLE':
      return 'E-Mail (Rechnung)';
    case 'BOOKING_DOCUMENTS':
      return 'E-Mail (Buchungsdokumente)';
    case 'NOTIFICATION':
      return 'Benachrichtigung';
    case 'TEST':
      return 'Test';
    default:
      return 'E-Mail';
  }
}

function resolveDocumentVersion(row: OutboundEmailHistoryRow): {
  documentId: string | null;
  version: number | null;
} {
  const attachmentDocId =
    row.attachments.map((a) => a.generatedDocumentId).find((id): id is string => !!id) ?? null;
  return {
    documentId: row.generatedDocumentId ?? attachmentDocId,
    version: row.documentVersionNumber,
  };
}

export function mapInvoiceEmailSendHistory(
  rows: OutboundEmailHistoryRow[],
): InvoiceEmailSendHistoryEntryDto[] {
  return [...rows]
    .sort(
      (a, b) =>
        (b.requestedAt?.getTime() ?? b.createdAt.getTime()) -
        (a.requestedAt?.getTime() ?? a.createdAt.getTime()),
    )
    .map((row) => {
      const doc = resolveDocumentVersion(row);
      const userSafeError = sanitizeOutboundErrorMessage(row.errorMessage);
      const communicationPhase = deriveOutboundCommunicationPhase(row);
      return {
        id: row.id,
        recipient: row.toEmail,
        cc: row.ccEmails,
        bcc: row.bccEmails,
        channel: mapChannel(row.sourceType),
        documentId: doc.documentId,
        documentVersion: doc.version,
        sendStatus: row.status,
        deliveryStatus: row.deliveryStatus,
        communicationPhase,
        communicationPhaseLabel: communicationPhaseLabel(communicationPhase),
        statusLabel: communicationPhaseLabel(communicationPhase),
        occurredAt: resolveDisplayTimestamp(row),
        requestedAt: row.requestedAt.toISOString(),
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        sentAt: row.sentAt?.toISOString() ?? null,
        deliveredAt: row.deliveredAt?.toISOString() ?? null,
        failedAt: row.failedAt?.toISOString() ?? null,
        triggeredByUserId: row.sentByUserId,
        triggeredByDisplayName: formatActor(row.sentByUser ?? null),
        senderFromEmail: row.fromEmail,
        senderFromName: row.fromName,
        senderReplyToEmail: row.replyToEmail,
        provider: row.provider,
        providerMessageId: row.providerMessageId,
        subject: row.subject,
        errorCode: row.errorCode,
        errorMessage: userSafeError,
        idempotencyKey: row.idempotencyKey,
        correlationId: row.correlationId,
        retryPossible: isRetryableOutboundEmail(row),
      };
    });
}
