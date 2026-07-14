import type { StatusTone } from '../../../components/patterns/status-utils';

export type InvoiceTimelineActorType = 'user' | 'system' | 'automation' | 'unavailable';

export type InvoiceTimelineEventKind =
  | 'INVOICE_CREATED'
  | 'INVOICE_ISSUED'
  | 'INVOICE_NUMBER_ASSIGNED'
  | 'PDF_GENERATED'
  | 'PDF_VERSION_REPLACED'
  | 'DELIVERY_PREPARED'
  | 'DELIVERY_SENT'
  | 'DELIVERY_DELIVERED'
  | 'DELIVERY_FAILED'
  | 'DELIVERY_EXTERNALLY_MARKED'
  | 'PAYMENT_PARTIAL'
  | 'PAYMENT_FULL'
  | 'PAYMENT_REVERSED'
  | 'INVOICE_OVERDUE'
  | 'INVOICE_CANCELLED'
  | 'INVOICE_CREDITED'
  | 'INVOICE_VOIDED'
  | 'PDF_GENERATION_FAILED'
  | 'DELIVERY_RETRY'
  | 'AUDIT';

export type InvoiceTimelineTone = 'success' | 'watch' | 'critical' | 'info' | 'neutral';

export interface InvoiceTimelineEvent {
  id: string;
  kind: InvoiceTimelineEventKind;
  label: string;
  occurredAt: string;
  actorType: InvoiceTimelineActorType;
  actorLabel: string;
  channel: string | null;
  reference: string | null;
  detail: string | null;
  tone: InvoiceTimelineTone;
}

export interface InvoiceTimelinePanel {
  events: InvoiceTimelineEvent[];
  sortOrder: 'desc';
  isLegacyReduced: boolean;
  timezone: string;
}

export function timelineToneToStatusTone(tone: InvoiceTimelineTone): StatusTone {
  switch (tone) {
    case 'success':
      return 'success';
    case 'critical':
      return 'critical';
    case 'watch':
      return 'watch';
    case 'info':
      return 'info';
    default:
      return 'neutral';
  }
}
