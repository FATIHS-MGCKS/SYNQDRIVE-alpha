import type { TimelineItem } from '../../../components/patterns';
import type { InvoiceTimelineEvent, InvoiceTimelinePanel } from './invoiceTimelineTypes';
import { timelineToneToStatusTone } from './invoiceTimelineTypes';

export function formatTimelineDateTime(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: timeZone || 'Europe/Berlin',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }
}

export interface InvoiceTimelineViewItem extends TimelineItem {
  hasCollapsibleDetail: boolean;
  actorLine: string;
  detail: string | null;
  occurredAt: string;
}

export function mapInvoiceTimelineEventToItem(
  event: InvoiceTimelineEvent,
  timeZone: string,
): InvoiceTimelineViewItem {
  const actorLine = [event.actorLabel, event.channel, event.reference].filter(Boolean).join(' · ');
  const hasCollapsibleDetail = Boolean(event.detail && event.detail.length > 48);

  return {
    id: event.id,
    title: event.label,
    time: formatTimelineDateTime(event.occurredAt, timeZone),
    description: hasCollapsibleDetail ? undefined : event.detail ?? undefined,
    tone: timelineToneToStatusTone(event.tone),
    hasCollapsibleDetail,
    actorLine,
    detail: event.detail,
    occurredAt: event.occurredAt,
  };
}

export function mapInvoiceTimelinePanel(panel: InvoiceTimelinePanel): InvoiceTimelineViewItem[] {
  return panel.events.map((event) => mapInvoiceTimelineEventToItem(event, panel.timezone));
}
