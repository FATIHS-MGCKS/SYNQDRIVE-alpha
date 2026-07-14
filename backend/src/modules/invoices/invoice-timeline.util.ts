import type { InvoiceTimelineEventDto } from './invoice-detail.types';
import type { InvoiceExternalSendEntryDto } from './invoice-detail.types';

type ActivityRow = {
  id: string;
  action: string;
  description: string;
  createdAt: Date;
};

export function mergeInvoiceTimeline(
  activityRows: ActivityRow[],
  externalSends: InvoiceExternalSendEntryDto[],
): InvoiceTimelineEventDto[] {
  const fromActivity: InvoiceTimelineEventDto[] = activityRows.map((r) => ({
    id: r.id,
    action: r.action,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    kind: 'ACTIVITY',
  }));

  const fromExternal: InvoiceTimelineEventDto[] = externalSends.map((e) => ({
    id: `external-send-${e.id}`,
    action: 'EXTERNAL_SEND_RECORDED',
    description: e.possibleDuplicate
      ? `${e.channelLabel} (mögliche Doppelerfassung)`
      : `Extern erfasst: ${e.channelLabel}`,
    createdAt: e.recordedAt,
    kind: 'EXTERNAL_SEND',
    channel: e.channel,
    externalSendId: e.id,
    source: e.source,
    sentAt: e.sentAt,
    recipient: e.recipient,
  }));

  return [...fromActivity, ...fromExternal].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
