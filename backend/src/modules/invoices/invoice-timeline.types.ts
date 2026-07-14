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

export type InvoiceTimelineActorType = 'user' | 'system' | 'automation' | 'unavailable';

export type InvoiceTimelineTone = 'success' | 'watch' | 'critical' | 'info' | 'neutral';

export interface InvoiceTimelineRawEvent {
  id: string;
  kind: InvoiceTimelineEventKind;
  occurredAt: Date;
  actorType: InvoiceTimelineActorType;
  actorName: string | null;
  channel: string | null;
  reference: string | null;
  detail: string | null;
  tone: InvoiceTimelineTone;
  source: 'invoice' | 'payment' | 'document' | 'email' | 'activity';
  dedupeKey?: string;
}

export interface InvoiceTimelineEventDto {
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

export interface InvoiceTimelineDto {
  events: InvoiceTimelineEventDto[];
  sortOrder: 'desc';
  isLegacyReduced: boolean;
  timezone: string;
}
