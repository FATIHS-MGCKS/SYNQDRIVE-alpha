import type { InvoiceExternalSendChannel, OrgInvoiceExternalSend } from '@prisma/client';
import { externalSendChannelLabel } from './invoice-external-send-channel.util';
import type { InvoiceExternalSendEntryDto } from './invoice-detail.types';

export type ExternalSendRow = OrgInvoiceExternalSend & {
  recordedByUser?: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
};

function formatActor(user: ExternalSendRow['recordedByUser']): string | null {
  if (!user) return null;
  const person = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (person) return person;
  if (user.name?.trim()) return user.name.trim();
  return user.email;
}

export function mapInvoiceExternalSendEntry(
  row: ExternalSendRow,
): InvoiceExternalSendEntryDto {
  return {
    id: row.id,
    channel: row.channel,
    channelLabel: externalSendChannelLabel(row.channel),
    sentAt: row.sentAt.toISOString(),
    recordedAt: row.createdAt.toISOString(),
    recipient: row.recipient,
    note: row.note,
    externalReference: row.externalReference,
    recordedByUserId: row.recordedByUserId,
    recordedByDisplayName: formatActor(row.recordedByUser ?? null),
    source: 'EXTERNAL_RECORDED',
    possibleDuplicate: row.duplicateOfId != null,
    duplicateOfId: row.duplicateOfId,
    idempotencyKey: row.idempotencyKey,
    correlationId: row.correlationId,
  };
}

export function mapInvoiceExternalSendHistory(
  rows: ExternalSendRow[],
): InvoiceExternalSendEntryDto[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.sentAt.getTime() - a.sentAt.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )
    .map(mapInvoiceExternalSendEntry);
}

export function buildExternalSendTimelineDescription(
  channel: InvoiceExternalSendChannel,
  recipient: string | null,
  possibleDuplicate: boolean,
): string {
  const label = externalSendChannelLabel(channel);
  const who = recipient?.trim() ? ` an ${recipient.trim()}` : '';
  const dup = possibleDuplicate ? ' (mögliche Doppelerfassung)' : '';
  return `Externer Versand erfasst: ${label}${who}${dup}`;
}
